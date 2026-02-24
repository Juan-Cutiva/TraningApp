"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import {
  db,
  getLastWeight,
  checkAndUpdatePRs,
  type WorkoutExerciseLog,
  type WorkoutSetLog,
  type WorkoutLog,
} from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Square,
  Trophy,
  Timer,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { RestTimer } from "@/components/workout/rest-timer"

const RPE_OPTIONS = [
  { value: "easy" as const, label: "Facil", color: "bg-success text-success-foreground" },
  { value: "normal" as const, label: "Normal", color: "bg-primary text-primary-foreground" },
  { value: "hard" as const, label: "Dificil", color: "bg-warning text-warning-foreground" },
  { value: "failure" as const, label: "Al fallo", color: "bg-destructive text-destructive-foreground" },
]

export function WorkoutMode({ routineId }: { routineId: number }) {
  const router = useRouter()
  const routine = useLiveQuery(() => db.routines.get(routineId))

  const [started, setStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [currentExIndex, setCurrentExIndex] = useState(0)
  const [exerciseLogs, setExerciseLogs] = useState<WorkoutExerciseLog[]>([])
  const [showRest, setShowRest] = useState(false)
  const [restKey, setRestKey] = useState(0)
  const [restDuration, setRestDuration] = useState(150)
  const [newPRs, setNewPRs] = useState<string[]>([])
  const [showPR, setShowPR] = useState(false)
  const [finished, setFinished] = useState(false)
  const startTimeRef = useRef<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Initialize exercise logs from routine
  useEffect(() => {
    if (routine && exerciseLogs.length === 0) {
      const initLogs: WorkoutExerciseLog[] = routine.exercises.map((ex) => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        muscleGroup: ex.muscleGroup,
        sets: Array.from({ length: ex.sets }, (_, i) => ({
          setNumber: i + 1,
          weight: ex.targetWeight,
          reps: ex.reps,
          rpe: "normal" as const,
          completed: false,
        })),
      }))

      // Load last weights async
      Promise.all(
        routine.exercises.map((ex) => getLastWeight(ex.name))
      ).then((weights) => {
        weights.forEach((w, i) => {
          if (w > 0) {
            initLogs[i].sets.forEach((s) => {
              s.weight = w
            })
          }
        })
        setExerciseLogs([...initLogs])
      })

      setExerciseLogs(initLogs)
      setRestDuration(routine.exercises[0]?.restSeconds ?? 150)
    }
  }, [routine, exerciseLogs.length])

  // Timer
  useEffect(() => {
    if (started && !paused && !finished) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [started, paused, finished])

  function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  function handleStart() {
    setStarted(true)
    startTimeRef.current = new Date()
  }

  function updateSet(
    exIndex: number,
    setIndex: number,
    field: keyof WorkoutSetLog,
    value: number | string | boolean
  ) {
    setExerciseLogs((prev) => {
      const updated = [...prev]
      const sets = [...updated[exIndex].sets]
      sets[setIndex] = { ...sets[setIndex], [field]: value }
      updated[exIndex] = { ...updated[exIndex], sets }
      return updated
    })
  }

  async function completeSet(exIndex: number, setIndex: number) {
    updateSet(exIndex, setIndex, "completed", true)

    // Check for PRs
    const exLog = exerciseLogs[exIndex]
    const completedSets = [
      ...exLog.sets.filter((s) => s.completed),
      { ...exLog.sets[setIndex], completed: true },
    ]
    const prs = await checkAndUpdatePRs(exLog.exerciseName, completedSets)
    if (prs.length > 0) {
      setNewPRs(prs.map((p) => `${p.exerciseName}: ${p.details}`))
      setShowPR(true)
      setTimeout(() => setShowPR(false), 3000)
    }

    // Show rest timer
    setShowRest(true)
  }

  async function handleFinish() {
    if (!routine || !startTimeRef.current) return

    const totalVolume = exerciseLogs.reduce(
      (sum, ex) =>
        sum +
        ex.sets
          .filter((s) => s.completed)
          .reduce((s2, set) => s2 + set.weight * set.reps, 0),
      0
    )

    const log: Omit<WorkoutLog, "id"> = {
      routineId: routine.id!,
      routineName: routine.name,
      date: new Date(),
      startTime: startTimeRef.current,
      endTime: new Date(),
      duration: elapsed,
      totalVolume,
      completed: true,
      exercises: exerciseLogs,
    }

    await db.workoutLogs.add(log as WorkoutLog)
    setFinished(true)
  }

  const currentExercise = exerciseLogs[currentExIndex]
  const totalSets = exerciseLogs.reduce((s, e) => s + e.sets.length, 0)
  const completedSets = exerciseLogs.reduce(
    (s, e) => s + e.sets.filter((set) => set.completed).length,
    0
  )
  const overallProgress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0

  if (!routine) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando rutina...</p>
      </div>
    )
  }

  // Finished screen
  if (finished) {
    const totalVolume = exerciseLogs.reduce(
      (sum, ex) =>
        sum +
        ex.sets
          .filter((s) => s.completed)
          .reduce((s2, set) => s2 + set.weight * set.reps, 0),
      0
    )
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-success/20">
          <Check className="h-10 w-10 text-success" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          Entrenamiento Completado
        </h1>
        <p className="mt-2 text-muted-foreground">{routine.name}</p>
        <div className="mt-8 grid w-full max-w-xs grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Duracion</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatTime(elapsed)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Volumen</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {totalVolume > 1000
                  ? `${(totalVolume / 1000).toFixed(1)}t`
                  : `${totalVolume}kg`}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Series</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {completedSets}/{totalSets}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Ejercicios</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {exerciseLogs.length}
              </p>
            </CardContent>
          </Card>
        </div>
        <Button
          onClick={() => router.push("/")}
          className="mt-8 w-full max-w-xs rounded-xl py-6 text-base font-semibold"
          size="lg"
        >
          Volver al Dashboard
        </Button>
      </div>
    )
  }

  // Pre-start screen
  if (!started) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <div className="flex items-center gap-3 px-4 pt-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/routines")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">{routine.name}</h1>
        </div>

        <div className="flex-1 px-4 pt-6">
          <div className="flex flex-col gap-2">
            {routine.exercises.map((ex, i) => (
              <Card key={ex.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium text-foreground">{ex.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ex.muscleGroup}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {ex.sets}x{ex.reps}{" "}
                    {ex.targetWeight > 0 ? `@ ${ex.targetWeight}kg` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="p-4 pb-8">
          <Button
            onClick={handleStart}
            className="w-full rounded-xl py-7 text-lg font-bold"
            size="lg"
          >
            <Play className="mr-2 h-6 w-6" />
            Comenzar Entrenamiento
          </Button>
        </div>
      </div>
    )
  }

  // Active workout screen
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* PR Notification */}
      {showPR && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center p-4">
          <div className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 shadow-lg animate-in slide-in-from-top">
            <Trophy className="h-5 w-5 text-accent-foreground" />
            <span className="font-bold text-accent-foreground">
              Nuevo Record!
            </span>
          </div>
        </div>
      )}

      {/* Rest Timer Overlay */}
      {showRest && (
        <RestTimer
          duration={restDuration}
          onChangeDuration={setRestDuration}
          onClose={() => setShowRest(false)}
        />
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => {
            if (confirm("Cancelar entrenamiento?")) router.push("/")
          }}
        >
          <X className="mr-1 h-4 w-4" />
          Salir
        </Button>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <span className="font-mono text-lg font-bold text-foreground">
            {formatTime(elapsed)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPaused(!paused)}
        >
          {paused ? (
            <Play className="h-5 w-5" />
          ) : (
            <Pause className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Progress */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progreso</span>
          <span>
            {completedSets}/{totalSets} series
          </span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* Exercise Navigation */}
      <div className="flex items-center justify-between px-4 pt-4">
        <Button
          variant="ghost"
          size="icon"
          disabled={currentExIndex === 0}
          onClick={() => setCurrentExIndex((p) => p - 1)}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {currentExIndex + 1} / {exerciseLogs.length}
          </p>
          <h2 className="text-xl font-bold text-foreground">
            {currentExercise?.exerciseName}
          </h2>
          <p className="text-xs text-muted-foreground">
            {currentExercise?.muscleGroup}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={currentExIndex === exerciseLogs.length - 1}
          onClick={() => setCurrentExIndex((p) => p + 1)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Sets */}
      <div className="flex-1 overflow-auto px-4 pt-4">
        <div className="mb-2 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
          <span className="col-span-1">Set</span>
          <span className="col-span-3 text-center">Peso</span>
          <span className="col-span-2 text-center">Reps</span>
          <span className="col-span-4 text-center">RPE</span>
          <span className="col-span-2 text-center">OK</span>
        </div>
        {currentExercise?.sets.map((set, si) => (
          <div
            key={si}
            className={cn(
              "mb-2 grid grid-cols-12 items-center gap-2 rounded-lg p-2",
              set.completed
                ? "bg-success/10"
                : "bg-card"
            )}
          >
            <span className="col-span-1 text-center text-sm font-bold text-muted-foreground">
              {set.setNumber}
            </span>
            <div className="col-span-3">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={set.weight}
                onChange={(e) =>
                  updateSet(
                    currentExIndex,
                    si,
                    "weight",
                    parseFloat(e.target.value) || 0
                  )
                }
                disabled={set.completed}
                className="h-9 text-center text-sm"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                min={0}
                value={set.reps}
                onChange={(e) =>
                  updateSet(
                    currentExIndex,
                    si,
                    "reps",
                    parseInt(e.target.value) || 0
                  )
                }
                disabled={set.completed}
                className="h-9 text-center text-sm"
              />
            </div>
            <div className="col-span-4">
              <select
                value={set.rpe}
                onChange={(e) =>
                  updateSet(currentExIndex, si, "rpe", e.target.value)
                }
                disabled={set.completed}
                className="h-9 w-full rounded-md border border-input bg-background px-1 text-xs text-foreground"
              >
                {RPE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex justify-center">
              {set.completed ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success">
                  <Check className="h-4 w-4 text-success-foreground" />
                </div>
              ) : (
                <Button
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => completeSet(currentExIndex, si)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Action */}
      <div className="border-t border-border p-4 pb-8">
        {overallProgress >= 100 ? (
          <Button
            onClick={handleFinish}
            className="w-full rounded-xl py-6 text-base font-bold bg-success text-success-foreground hover:bg-success/90"
            size="lg"
          >
            <Square className="mr-2 h-5 w-5" />
            Finalizar Entrenamiento
          </Button>
        ) : currentExercise?.sets.every((s) => s.completed) &&
          currentExIndex < exerciseLogs.length - 1 ? (
          <Button
            onClick={() => setCurrentExIndex((p) => p + 1)}
            className="w-full rounded-xl py-6 text-base font-bold"
            size="lg"
          >
            Siguiente Ejercicio
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            variant="outline"
            className="w-full rounded-xl py-6 text-base font-medium"
            size="lg"
          >
            Terminar Antes
          </Button>
        )}
      </div>
    </div>
  )
}
