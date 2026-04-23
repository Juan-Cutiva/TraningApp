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
  /**
   * Optional reference to an `Equipment` (either a catalog entry or a
   * user-created custom one). When present, the RPE engine uses the
   * equipment's `increment` to scale recommendations — a machine with a
   * 5 kg stack step won't get a "+2 kg" suggestion, the engine will fall
   * back to rep progression instead. Omitted for back-compat.
   */
  equipmentId?: string;
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
    /** Weight change (in the exercise's unit) suggested for the next session. */
    weightDelta?: number;
    /** Rep change suggested for the next session (independent of weight). */
    repsDelta?: number;
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
  /**
   * Unit the `value` is expressed in. Optional for back-compat — older records
   * without a unit are assumed to be in kg. Used for cross-unit comparison
   * (e.g. a 130 lb bench PR vs a 60 kg PR resolves correctly).
   */
  unit?: string;
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

/**
 * Type of weight source for an exercise. Determines available weight
 * increments, which the RPE engine uses to scale recommendations.
 *
 * - barbell: 1.25 / 2.5 / 5 / 10 / 20 kg plates (microplates common)
 * - dumbbell: typically 2.5 kg steps (1 kg in some gyms, 5 lb in imperial)
 * - machine_stack: selectorized weight stack, usually 5 kg steps
 * - machine_stack_fine: modern stack with 2.5 kg steps, or stack + add-on peg
 * - plate_loaded: machine loaded with standard plates (hack squat, leverage row)
 * - cable: cable tower, usually 5 kg stack
 * - smith: smith machine (bar counterweight varies, uses plates)
 * - bodyweight: no external weight (optional band/belt load)
 * - custom: user-defined, increment configured per equipment
 */
export type EquipmentType =
  | "barbell"
  | "dumbbell"
  | "machine_stack"
  | "machine_stack_fine"
  | "plate_loaded"
  | "cable"
  | "smith"
  | "bodyweight"
  | "custom";

/**
 * Movement classification — compound recruits multiple joints/muscles,
 * isolation targets a single muscle at one joint. Affects recommendation
 * aggressiveness (compounds tolerate bigger load jumps).
 */
export type MovementKind = "compound" | "isolation";

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  muscleGroups: string[];
  movement: MovementKind;
  /** Carriage/bar/stack minimum (kg). Zero for pure bodyweight. */
  minWeight: number;
  /** Upper limit in kg, or null for "no practical cap" (free weight, plate-loaded). */
  maxWeight: number | null;
  /** Smallest available step in the equipment's unit. */
  increment: number;
  /** Optional secondary micro-step (e.g. 2.5 kg add-on peg on a 5 kg stack). */
  microIncrement?: number;
  unit: "kg" | "lb";
  /** Lucide icon name (from catalog) or null for custom. */
  icon?: string;
  /** Base64 data-URL. Only used by custom user-uploaded photos. */
  photo?: string;
  /** True if user-created and stored in Dexie. False for catalog entries. */
  isCustom: boolean;
  createdAt?: Date;
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
  /** User-created custom equipment. Catalog equipment lives in `lib/equipment-catalog.ts` (not persisted). */
  customEquipment!: EntityTable<Equipment, "id">;

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
    // v4 — custom equipment table (id is a string UUID, primary key)
    this.version(4).stores({
      routines: "++id, name, dayOfWeek",
      workoutLogs: "++id, routineId, date, completed",
      personalRecords: "++id, exerciseName, type, date",
      goals: "++id, type, completed",
      userSettings: "++id",
      bodyWeight: "++id, date",
      weightGoals: "++id, createdAt",
      users: "++id, &email",
      customEquipment: "id, name, type",
    });
  }
}

export const db = new GymDB();

// --- Helpers ---

/**
 * Resolve an equipment id against catalog + user-created customs.
 * Catalog entries are static (bundled in lib/equipment-catalog.ts); customs
 * live in the `customEquipment` Dexie table.
 */
export async function resolveEquipment(
  id: string | undefined | null,
): Promise<Equipment | undefined> {
  if (!id) return undefined;
  const { findCatalogEquipment } = await import("./equipment-catalog");
  const fromCatalog = findCatalogEquipment(id);
  if (fromCatalog) return fromCatalog;
  return db.customEquipment.get(id);
}

export async function getOrCreateSettings(): Promise<UserSettings> {
  const existing = await db.userSettings.toCollection().first();
  if (existing) return existing;
  const id = await db.userSettings.add({
    defaultRestSeconds: 150,
    theme: "dark",
    bodyWeight: null,
    defaultUnit: "kg",
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
  // NOTE: we intentionally don't use `.where("completed").equals(1)` here —
  // workoutLog.completed is a boolean, not an integer, and IndexedDB key
  // comparison is strict (true !== 1), so that query returns an empty array.
  // Filter in JS instead to be robust regardless of how completed is stored.
  const allLogs = await db.workoutLogs.toArray();
  const logs = allLogs.filter((l) => Boolean(l.completed));
  // Orden: más reciente primero, tolerando fechas inválidas
  logs.sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (isNaN(tb)) return -1;
    if (isNaN(ta)) return 1;
    return tb - ta;
  });
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
  const repsNum = typeof reps === "string"
    ? parseFloat(reps.replace(",", ".")) || 0
    : reps;

  if (repsNum <= 0 || !isFinite(weight) || weight <= 0) {
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

  // Obtener coeficiente muscular si está disponible (case-insensitive)
  const coef = muscleGroup
    ? (MUSCLE_GROUP_COEFFICIENTS[muscleGroup]
      ?? MUSCLE_GROUP_COEFFICIENTS[muscleGroup.charAt(0).toUpperCase() + muscleGroup.slice(1).toLowerCase()]
      ?? DEFAULT_COEFFICIENT)
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

/**
 * Convert any supported weight to kg for cross-unit PR comparison.
 * Anything that isn't "lb"/"lbs" is assumed to be kg (including "otro").
 */
export function toKg(weight: number, unit: string | undefined): number {
  if (!unit) return weight;
  const u = unit.toLowerCase();
  if (u === "lb" || u === "lbs") return weight * 0.453592;
  return weight;
}

/**
 * Compute the new PRs produced by a list of sets, comparing against existing
 * DB PRs with unit-aware logic (e.g. 130 lb = 58.97 kg, so a 60 kg PR wins).
 * Returns the new/updated PR payloads but does NOT persist them. Persistence
 * is handled by `persistPRs` inside the handleFinish transaction so the
 * workoutLog and its PRs are written atomically.
 */
export async function computeNewPRs(
  exerciseName: string,
  sets: WorkoutSetLog[],
  muscleGroup?: string,
): Promise<PersonalRecord[]> {
  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) return [];

  const maxWeight = Math.max(
    ...completedSets.map((s) => Number(s.weight) || 0),
  );
  const maxReps = Math.max(
    ...completedSets.map((s) =>
      typeof s.reps === "string"
        ? parseFloat(s.reps.replace(",", ".")) || 0
        : s.reps,
    ),
  );
  const unit = completedSets[0]?.unit || "kg";

  const existingPRs = await db.personalRecords
    .where("exerciseName")
    .equals(exerciseName)
    .toArray();

  const out: PersonalRecord[] = [];
  const now = new Date();

  // WEIGHT — compare in kg to allow lb ↔ kg progressions.
  if (maxWeight > 0) {
    const weightPR = existingPRs.find((p) => p.type === "weight");
    const existingKg = weightPR ? toKg(weightPR.value, weightPR.unit) : 0;
    const candidateKg = toKg(maxWeight, unit);
    if (!weightPR || candidateKg > existingKg) {
      out.push({
        id: weightPR?.id,
        exerciseName,
        muscleGroup,
        type: "weight",
        value: maxWeight,
        unit,
        date: now,
        details: `${maxWeight} ${unit}`,
      });
    }
  }

  // REPS — unit-independent.
  if (maxReps > 0) {
    const repsPR = existingPRs.find((p) => p.type === "reps");
    if (!repsPR || maxReps > repsPR.value) {
      out.push({
        id: repsPR?.id,
        exerciseName,
        muscleGroup,
        type: "reps",
        value: maxReps,
        date: now,
        details: `${maxReps} reps`,
      });
    }
  }

  // 1RM — compare in kg equivalent.
  if (maxWeight > 0 && maxReps > 0) {
    const oneRM = calculate1RM(maxWeight, maxReps, muscleGroup);
    const oneRMPR = existingPRs.find((p) => p.type === "1rm");
    const existingKg = oneRMPR ? toKg(oneRMPR.value, oneRMPR.unit) : 0;
    const candidateKg = toKg(oneRM.promedio, unit);
    if (!oneRMPR || candidateKg > existingKg) {
      out.push({
        id: oneRMPR?.id,
        exerciseName,
        muscleGroup,
        type: "1rm",
        value: oneRM.promedio,
        unit,
        date: now,
        details: `~${oneRM.promedio} ${unit} (${oneRM.fiabilidad})`,
      });
    }
  }

  return out;
}

/**
 * Write an array of computed PRs (from `computeNewPRs`) to Dexie. Use inside
 * a `db.transaction` together with the workoutLogs write so both succeed or
 * neither does. Existing PRs are updated by id, new ones are added.
 */
export async function persistPRs(prs: PersonalRecord[]): Promise<void> {
  for (const pr of prs) {
    if (pr.id != null) {
      const { id, ...rest } = pr;
      await db.personalRecords.update(id, rest);
    } else {
      await db.personalRecords.add(pr);
    }
  }
}

/**
 * @deprecated Use `computeNewPRs` + `persistPRs` inside a transaction for
 * atomicity with the workoutLog write. This combined function writes PRs
 * without the log and can produce orphan PRs if the log save later fails.
 *
 * Kept only for backward compatibility of any existing callers. Delete after
 * verifying nothing else uses it.
 */
export async function checkAndUpdatePRs(
  exerciseName: string,
  sets: WorkoutSetLog[],
  muscleGroup?: string,
): Promise<PersonalRecord[]> {
  const prs = await computeNewPRs(exerciseName, sets, muscleGroup);
  await persistPRs(prs);
  return prs;
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
