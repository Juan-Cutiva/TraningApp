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
  totalVolume: number;
  completed: boolean;
  exercises: WorkoutExerciseLog[];
}

export interface WorkoutExerciseLog {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  supersetId?: string;
  sets: WorkoutSetLog[];
}

export interface WorkoutSetLog {
  setNumber: number;
  weight: number | "";
  unit: string;
  reps: number | string;
  rpe?: "easy" | "normal" | "hard" | "failure"; // Made optional just in case
  completed: boolean;
}

export interface PersonalRecord {
  id?: number;
  exerciseName: string;
  type: "weight" | "reps";
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

// --- Database ---

class GymDB extends Dexie {
  routines!: EntityTable<Routine, "id">;
  workoutLogs!: EntityTable<WorkoutLog, "id">;
  personalRecords!: EntityTable<PersonalRecord, "id">;
  goals!: EntityTable<Goal, "id">;
  userSettings!: EntityTable<UserSettings, "id">;
  bodyWeight!: EntityTable<BodyWeightEntry, "id">;
  weightGoals!: EntityTable<WeightGoal, "id">;

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
  const logs = await db.workoutLogs
    .where("completed")
    .equals(1)
    .reverse()
    .sortBy("date");
  const history: WorkoutExerciseLog[] = [];
  for (const log of logs) {
    const ex = log.exercises.find((e) => e.exerciseName === exerciseName);
    if (ex) history.push(ex);
  }
  return history;
}

export async function getLastWeight(exerciseName: string): Promise<number> {
  const history = await getExerciseHistory(exerciseName);
  if (history.length === 0) return 0;
  const lastSets = history[0].sets.filter((s) => s.completed);
  if (lastSets.length === 0) return 0;
  return Math.max(...lastSets.map((s) => Number(s.weight) || 0));
}

export function calculate1RM(
  weight: number,
  reps: number | string,
): { epley: number; brzycki: number; lombardi: number } {
  const repsNum = typeof reps === "string" ? parseInt(reps, 10) || 0 : reps;

  if (repsNum <= 0) return { epley: 0, brzycki: 0, lombardi: 0 };
  if (repsNum === 1)
    return { epley: weight, brzycki: weight, lombardi: weight };
  return {
    epley: Math.round(weight * (1 + repsNum / 30) * 10) / 10,
    brzycki: Math.round(((weight * 36) / (37 - repsNum)) * 10) / 10,
    lombardi: Math.round(weight * Math.pow(repsNum, 0.1) * 10) / 10,
  };
}

export async function checkAndUpdatePRs(
  exerciseName: string,
  sets: WorkoutSetLog[],
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

  return newPRs;
}
