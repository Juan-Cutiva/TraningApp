import Dexie, { type EntityTable } from "dexie";

// --- Types ---

export interface Routine {
  id?: number;
  name: string;
  dayOfWeek: number | null; // 0=Sunday ... 6=Saturday, null=unassigned
  exercises: RoutineExercise[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutineExercise {
  id: string;
  name: string;
  muscleGroup: string;
  sets: number;
  reps: number | string;
  targetWeight: number;
  unit: string;
  restSeconds: number;
  supersetId?: string;
}

export interface WorkoutLog {
  id?: number;
  routineId: number;
  routineName: string;
  date: Date;
  startTime: Date;
  endTime: Date | null;
  duration: number; // seconds
  completed: boolean;
  exercises: WorkoutExerciseLog[];
  notes?: string;
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  supersetId?: string;
  sets: WorkoutSetLog[];
  /** Recommendation from the RPE engine at end of this exercise (persisted for next session) */
  lastRecommendation?: {
    headline: string;
    detail: string;
    emoji: string;
    color: string;
  };
}

export interface WorkoutSetLog {
  setNumber: number;
  weight: number | string;
  unit: string;
  reps: number | string;
  rpe?: "easy" | "normal" | "hard" | "failure"; // Made optional just in case
  completed: boolean;
}

export interface PersonalRecord {
  id?: number;
  exerciseName: string;
  muscleGroup?: string;
  type: "weight" | "reps" | "1rm";
  value: number;
  date: Date;
  details: string;
}

export interface Goal {
  id?: number;
  type: "weight" | "frequency" | "bodyweight";
  description: string;
  exerciseName?: string;
  targetValue: number;
  currentValue: number;
  startValue: number;
  startDate: Date;
  targetDate: Date;
  completed: boolean;
  createdAt: Date;
}

export interface UserSettings {
  id?: number;
  defaultRestSeconds: number;
  theme: "light" | "dark" | "system";
  bodyWeight: number | null;
  height?: number | null; // height in cm for BMI
  defaultUnit: string;
  // Music widget settings
  musicService: "spotify" | "youtube" | null;
  musicEmbedUrl: string;
  showMusicWidget: boolean;
}

export interface BodyWeightEntry {
  id?: number;
  weight: number;
  date: Date;
  note?: string;
}

export interface WeightGoal {
  id?: number;
  targetWeight: number;
  startWeight: number;
  startDate: Date;
  achieved: boolean;
  createdAt: Date;
}

export interface AppUser {
  id?: number;
  email: string;
  passwordHash: string; // SHA-256 hex digest
  createdAt: Date;
}

// --- Database ---

class GymDB extends Dexie {
  routines!: EntityTable<Routine, "id">;
  workoutLogs!: EntityTable<WorkoutLog, "id">;
  personalRecords!: EntityTable<PersonalRecord, "id">;
  goals!: EntityTable<Goal, "id">;
  userSettings!: EntityTable<UserSettings, "id">;
  bodyWeight!: EntityTable<BodyWeightEntry, "id">;
  weightGoals!: EntityTable<WeightGoal, "id">;
  users!: EntityTable<AppUser, "id">;

  constructor() {
    super("GymTrackerDB");
    this.version(2).stores({
      routines: "++id, name, dayOfWeek",
      workoutLogs: "++id, routineId, date, completed",
      personalRecords: "++id, exerciseName, type, date",
      goals: "++id, type, completed",
      userSettings: "++id",
      bodyWeight: "++id, date",
      weightGoals: "++id, createdAt",
    });
    this.version(3).stores({
      routines: "++id, name, dayOfWeek",
      workoutLogs: "++id, routineId, date, completed",
      personalRecords: "++id, exerciseName, type, date",
      goals: "++id, type, completed",
      userSettings: "++id",
      bodyWeight: "++id, date",
      weightGoals: "++id, createdAt",
      users: "++id, &email",
    });
  }
}

export const db = new GymDB();

// --- Helpers ---

export async function getOrCreateSettings(): Promise<UserSettings> {
  const existing = await db.userSettings.toCollection().first();
  if (existing) return existing;
  const id = await db.userSettings.add({
    defaultRestSeconds: 150,
    theme: "dark",
    bodyWeight: null,
    defaultUnit: "kg",
    musicService: null,
    musicEmbedUrl: "",
    showMusicWidget: false,
  });
  return (await db.userSettings.get(id))!;
}

export async function getTodayRoutine(): Promise<Routine | undefined> {
  const dayOfWeek = new Date().getDay();
  return db.routines.where("dayOfWeek").equals(dayOfWeek).first();
}

export async function getExerciseHistory(
  exerciseName: string,
): Promise<WorkoutExerciseLog[]> {
  // orderBy + reverse() da DESC correcto; .reverse().sortBy() ignoraba el reverse
  const logs = await db.workoutLogs
    .where("completed")
    .equals(1)
    .toArray();
  // Ordenar por fecha descendente (más reciente primero)
  logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const history: WorkoutExerciseLog[] = [];
  for (const log of logs) {
    const ex = log.exercises.find((e) => e.exerciseName === exerciseName);
    if (ex) history.push(ex);
  }
  return history;
}

export async function getLastRecommendation(
  exerciseName: string,
): Promise<WorkoutExerciseLog["lastRecommendation"] | undefined> {
  const history = await getExerciseHistory(exerciseName);
  if (history.length === 0) return undefined;
  return history[0].lastRecommendation;
}

export async function getLastWeight(exerciseName: string): Promise<number> {
  const history = await getExerciseHistory(exerciseName);
  if (history.length === 0) return 0;
  const lastSets = history[0].sets.filter((s) => s.completed);
  if (lastSets.length === 0) return 0;
  return Math.max(...lastSets.map((s) => Number(s.weight) || 0));
}

/**
 * Cálculo de 1RM (Una Repetición Máxima)
 *
 * Basado en estudios científicos:
 * - Epley (1985): Precisión moderada, mejor para 1-10 repeticiones
 * - Brzycki (1996): Precisión alta, mejor para 6-10 repeticiones
 * - Lombardi (2010): Basado en análisis estadístico
 * - Mayhew (2005): Precisión para ejercicios multiarticulares
 * - O'Conner (1985): Alternativa simple
 * - Wathan (2002): Precisión para ejercicios mono y multiarticulares
 *
 * El promedio de todas las fórmulas da el valor más confiable
 */

export interface OneRMResult {
  epley: number;
  brzycki: number;
  lombardi: number;
  mayhew: number;
  oconner: number;
  wathan: number;
  promedio: number;
  fiabilidad: "alta" | "media" | "baja";
}

// Grupos musculares con coeficientes de fatiga específicos
// Basados en estudios de biomecánica muscular
const MUSCLE_GROUP_COEFFICIENTS: Record<string, number> = {
  // Piernas (mayor capacidad)
  Piernas: 1.05,
  Cuádriceps: 1.05,
  Gluteos: 1.03,
  Pantorrillas: 1.02,

  // Espalda (fuerza media-alta)
  Espalda: 1.02,
  Dorsales: 1.02,
  Lumbar: 1.0,

  // Pecho (fuerza media)
  Pecho: 1.0,
  Pectorales: 1.0,

  // Hombros (fuerza media)
  Hombros: 0.98,
  Deltoides: 0.98,
  Trapecio: 1.0,

  // Brazos (menor capacidad relativa)
  Biceps: 0.95,
  Triceps: 0.97,
  Antebrazos: 0.93,

  // Core (menor capacidad)
  Core: 0.92,
  Abdominales: 0.9,

  // Cardio (no aplica)
  Cardio: 1.0,
};

// Por defecto
const DEFAULT_COEFFICIENT = 1.0;

export function calculate1RM(
  weight: number,
  reps: number | string,
  muscleGroup?: string,
): OneRMResult {
  const repsNum = typeof reps === "string" ? parseInt(reps, 10) || 0 : reps;

  if (repsNum <= 0) {
    return {
      epley: 0,
      brzycki: 0,
      lombardi: 0,
      mayhew: 0,
      oconner: 0,
      wathan: 0,
      promedio: 0,
      fiabilidad: "baja",
    };
  }

  // Si es solo 1 repetición, el peso es el 1RM
  if (repsNum === 1) {
    return {
      epley: weight,
      brzycki: weight,
      lombardi: weight,
      mayhew: weight,
      oconner: weight,
      wathan: weight,
      promedio: weight,
      fiabilidad: "alta",
    };
  }

  // Obtener coeficiente muscular si está disponible
  const coef = muscleGroup
    ? (MUSCLE_GROUP_COEFFICIENTS[muscleGroup] ?? DEFAULT_COEFFICIENT)
    : DEFAULT_COEFFICIENT;

  // Fórmulas científicas (todas usan el peso y repeticiones realizadas)

  // 1. Epley (1985) - Una de las más usadas
  // Precisión: ±3-5% para 1-10 repeticiones
  const epley = weight * (1 + repsNum / 30);

  // 2. Brzycki (1996) - Muy precisa para 6-10 repeticiones
  // Precisión: ±3% cuando las reps son entre 1-10
  // Cap at 36 to avoid divide-by-zero (denominator 37-reps would be 0 at reps=37)
  const brzycki = weight * (36 / (37 - Math.min(repsNum, 36)));

  // 3. Lombardi (2010) - Alternativa moderna
  const lombardi = weight * Math.pow(repsNum, 0.1);

  // 4. Mayhew et al. (2005) - Especialmente buena para ejercicios compuestos
  const mayhew = (100 * weight) / (52.2 + 41.9 * Math.exp(-0.055 * repsNum));

  // 5. O'Conner (1985) - Fórmula simple pero efectiva
  const oconner = weight * (1 + repsNum / 40);

  // 6. Wathan (2002) - Precisión para ejercicios mono y multiarticulares
  const wathan = (100 * weight) / (48.8 + 53.8 * Math.exp(-0.075 * repsNum));

  // Calcular promedio de todas las fórmulas (método de consenso)
  const values = [epley, brzycki, lombardi, mayhew, oconner, wathan];
  const promedio = values.reduce((a, b) => a + b, 0) / values.length;

  // Determinar fiabilidad basada en repeticiones
  let fiabilidad: "alta" | "media" | "baja";
  if (repsNum <= 5) {
    fiabilidad = "alta";
  } else if (repsNum <= 12) {
    fiabilidad = "media";
  } else {
    fiabilidad = "baja";
  }

  // Aplicar coeficiente muscular (ajuste por grupo muscular)
  const ajustado = promedio * coef;

  return {
    epley: Math.round(epley * 10) / 10,
    brzycki: Math.round(brzycki * 10) / 10,
    lombardi: Math.round(lombardi * 10) / 10,
    mayhew: Math.round(mayhew * 10) / 10,
    oconner: Math.round(oconner * 10) / 10,
    wathan: Math.round(wathan * 10) / 10,
    promedio: Math.round(ajustado * 10) / 10,
    fiabilidad,
  };
}

/**
 * Obtiene una estimación de peso para un número objetivo de repeticiones basado en el 1RM
 * Fórmula inversa de Epley: peso = 1RM / (1 + reps/30)
 */
export function estimateWeightForReps(
  oneRM: number,
  targetReps: number,
): number {
  if (targetReps <= 0 || oneRM <= 0) return 0;
  if (targetReps === 1) return oneRM;

  const peso = oneRM / (1 + targetReps / 30);
  return Math.round(peso * 10) / 10;
}

/**
 * Calcula el porcentaje del 1RM para un peso y repeticiones dados
 */
export function getPercentageOf1RM(weight: number, reps: number): number {
  const oneRM = calculate1RM(weight, reps);
  if (oneRM.promedio === 0) return 0;

  const percentage = (weight / oneRM.promedio) * 100;
  return Math.round(percentage);
}

export async function checkAndUpdatePRs(
  exerciseName: string,
  sets: WorkoutSetLog[],
  muscleGroup?: string,
): Promise<PersonalRecord[]> {
  const newPRs: PersonalRecord[] = [];
  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) return newPRs;

  const maxWeight = Math.max(
    ...completedSets.map((s) => Number(s.weight) || 0),
  );
  const maxReps = Math.max(
    ...completedSets.map((s) =>
      typeof s.reps === "string" ? parseInt(s.reps, 10) || 0 : s.reps,
    ),
  );

  const existingPRs = await db.personalRecords
    .where("exerciseName")
    .equals(exerciseName)
    .toArray();

  const unit = completedSets[0]?.unit || "kg";

  // Weight PR
  const weightPR = existingPRs.find((p) => p.type === "weight");
  if (!weightPR || maxWeight > weightPR.value) {
    const pr: PersonalRecord = {
      exerciseName,
      muscleGroup,
      type: "weight",
      value: maxWeight,
      date: new Date(),
      details: `${maxWeight} ${unit}`,
    };
    if (weightPR) {
      await db.personalRecords.update(weightPR.id!, pr);
    } else {
      await db.personalRecords.add(pr);
    }
    newPRs.push(pr);
  }

  // Reps PR
  const repsPR = existingPRs.find((p) => p.type === "reps");
  if (!repsPR || maxReps > repsPR.value) {
    const pr: PersonalRecord = {
      exerciseName,
      muscleGroup,
      type: "reps",
      value: maxReps,
      date: new Date(),
      details: `${maxReps} reps`,
    };
    if (repsPR) {
      await db.personalRecords.update(repsPR.id!, pr);
    } else {
      await db.personalRecords.add(pr);
    }
    newPRs.push(pr);
  }

  // 1RM PR - calcula el 1RM estimado basado en el mejor set
  if (maxWeight > 0 && maxReps > 0) {
    const oneRMResult = calculate1RM(maxWeight, maxReps, muscleGroup);
    const oneRMPR = existingPRs.find((p) => p.type === "1rm");

    if (!oneRMPR || oneRMResult.promedio > oneRMPR.value) {
      const pr: PersonalRecord = {
        exerciseName,
        muscleGroup,
        type: "1rm",
        value: oneRMResult.promedio,
        date: new Date(),
        details: `~${oneRMResult.promedio} ${unit} (${oneRMResult.fiabilidad})`,
      };
      if (oneRMPR) {
        await db.personalRecords.update(oneRMPR.id!, pr);
      } else {
        await db.personalRecords.add(pr);
      }
      newPRs.push(pr);
    }
  }

  return newPRs;
}

/**
 * Estimates total workout duration in seconds.
 * Formula: per exercise = sets × execTimePerSet + (sets-1) × restSeconds
 * + 60s transition between exercises.
 * Supersets run in parallel (only counted once per group).
 */
export function estimateRoutineDuration(routine: Routine): number {
  let totalSeconds = 0;
  const seenSupersets = new Set<string>();

  for (const ex of routine.exercises) {
    // Skip repeated superset members — count the whole group once
    if (ex.supersetId) {
      if (seenSupersets.has(ex.supersetId)) continue;
      seenSupersets.add(ex.supersetId);
    }

    const repsStr = ex.reps.toString();
    const repsNum = parseInt(repsStr.match(/\d+/)?.[0] ?? "10", 10);

    // Approximate time to execute one set (seconds)
    const execPerSet =
      repsNum <= 5 ? 25 : repsNum <= 10 ? 35 : repsNum <= 15 ? 50 : 70;

    const rest = ex.restSeconds ?? 150;

    // sets × exec + (sets-1) × rest + 60s transition
    totalSeconds += ex.sets * execPerSet + (ex.sets - 1) * rest + 60;
  }

  return totalSeconds;
}
