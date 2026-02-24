import Dexie, { type EntityTable } from "dexie"

// --- Types ---

export interface Routine {
  id?: number
  name: string
  dayOfWeek: number | null // 0=Sunday ... 6=Saturday, null=unassigned
  exercises: RoutineExercise[]
  createdAt: Date
  updatedAt: Date
}

export interface RoutineExercise {
  id: string
  name: string
  muscleGroup: string
  sets: number
  reps: number
  targetWeight: number
  restSeconds: number
}

export interface WorkoutLog {
  id?: number
  routineId: number
  routineName: string
  date: Date
  startTime: Date
  endTime: Date | null
  duration: number // seconds
  totalVolume: number
  completed: boolean
  exercises: WorkoutExerciseLog[]
}

export interface WorkoutExerciseLog {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  sets: WorkoutSetLog[]
}

export interface WorkoutSetLog {
  setNumber: number
  weight: number
  reps: number
  rpe: "easy" | "normal" | "hard" | "failure"
  completed: boolean
}

export interface PersonalRecord {
  id?: number
  exerciseName: string
  type: "weight" | "volume" | "reps"
  value: number
  date: Date
  details: string
}

export interface Goal {
  id?: number
  type: "weight" | "frequency" | "bodyweight"
  description: string
  exerciseName?: string
  targetValue: number
  currentValue: number
  startValue: number
  startDate: Date
  targetDate: Date
  completed: boolean
  createdAt: Date
}

export interface UserSettings {
  id?: number
  defaultRestSeconds: number
  theme: "light" | "dark" | "system"
  bodyWeight: number | null
}

// --- Database ---

class GymDB extends Dexie {
  routines!: EntityTable<Routine, "id">
  workoutLogs!: EntityTable<WorkoutLog, "id">
  personalRecords!: EntityTable<PersonalRecord, "id">
  goals!: EntityTable<Goal, "id">
  userSettings!: EntityTable<UserSettings, "id">

  constructor() {
    super("GymTrackerDB")
    this.version(1).stores({
      routines: "++id, name, dayOfWeek",
      workoutLogs: "++id, routineId, date, completed",
      personalRecords: "++id, exerciseName, type, date",
      goals: "++id, type, completed",
      userSettings: "++id",
    })
  }
}

export const db = new GymDB()

// --- Helpers ---

export async function getOrCreateSettings(): Promise<UserSettings> {
  const existing = await db.userSettings.toCollection().first()
  if (existing) return existing
  const id = await db.userSettings.add({
    defaultRestSeconds: 150,
    theme: "dark",
    bodyWeight: null,
  })
  return (await db.userSettings.get(id))!
}

export async function getTodayRoutine(): Promise<Routine | undefined> {
  const dayOfWeek = new Date().getDay()
  return db.routines.where("dayOfWeek").equals(dayOfWeek).first()
}

export async function getExerciseHistory(
  exerciseName: string
): Promise<WorkoutExerciseLog[]> {
  const logs = await db.workoutLogs
    .where("completed")
    .equals(1)
    .reverse()
    .sortBy("date")
  const history: WorkoutExerciseLog[] = []
  for (const log of logs) {
    const ex = log.exercises.find((e) => e.exerciseName === exerciseName)
    if (ex) history.push(ex)
  }
  return history
}

export async function getLastWeight(exerciseName: string): Promise<number> {
  const history = await getExerciseHistory(exerciseName)
  if (history.length === 0) return 0
  const lastSets = history[0].sets.filter((s) => s.completed)
  if (lastSets.length === 0) return 0
  return Math.max(...lastSets.map((s) => s.weight))
}

export function calculate1RM(
  weight: number,
  reps: number
): { epley: number; brzycki: number; lombardi: number } {
  if (reps === 0) return { epley: 0, brzycki: 0, lombardi: 0 }
  if (reps === 1) return { epley: weight, brzycki: weight, lombardi: weight }
  return {
    epley: Math.round(weight * (1 + reps / 30) * 10) / 10,
    brzycki: Math.round((weight * 36) / (37 - reps) * 10) / 10,
    lombardi: Math.round(weight * Math.pow(reps, 0.1) * 10) / 10,
  }
}

export async function checkAndUpdatePRs(
  exerciseName: string,
  sets: WorkoutSetLog[]
): Promise<PersonalRecord[]> {
  const newPRs: PersonalRecord[] = []
  const completedSets = sets.filter((s) => s.completed)
  if (completedSets.length === 0) return newPRs

  const maxWeight = Math.max(...completedSets.map((s) => s.weight))
  const maxVolume = completedSets.reduce((sum, s) => sum + s.weight * s.reps, 0)
  const maxReps = Math.max(...completedSets.map((s) => s.reps))

  const existingPRs = await db.personalRecords
    .where("exerciseName")
    .equals(exerciseName)
    .toArray()

  const weightPR = existingPRs.find((p) => p.type === "weight")
  if (!weightPR || maxWeight > weightPR.value) {
    const pr: PersonalRecord = {
      exerciseName,
      type: "weight",
      value: maxWeight,
      date: new Date(),
      details: `${maxWeight} kg`,
    }
    if (weightPR) {
      await db.personalRecords.update(weightPR.id!, pr)
    } else {
      await db.personalRecords.add(pr)
    }
    newPRs.push(pr)
  }

  const volumePR = existingPRs.find((p) => p.type === "volume")
  if (!volumePR || maxVolume > volumePR.value) {
    const pr: PersonalRecord = {
      exerciseName,
      type: "volume",
      value: maxVolume,
      date: new Date(),
      details: `${maxVolume} kg vol`,
    }
    if (volumePR) {
      await db.personalRecords.update(volumePR.id!, pr)
    } else {
      await db.personalRecords.add(pr)
    }
    newPRs.push(pr)
  }

  const repsPR = existingPRs.find((p) => p.type === "reps")
  if (!repsPR || maxReps > repsPR.value) {
    const pr: PersonalRecord = {
      exerciseName,
      type: "reps",
      value: maxReps,
      date: new Date(),
      details: `${maxReps} reps`,
    }
    if (repsPR) {
      await db.personalRecords.update(repsPR.id!, pr)
    } else {
      await db.personalRecords.add(pr)
    }
    newPRs.push(pr)
  }

  return newPRs
}
