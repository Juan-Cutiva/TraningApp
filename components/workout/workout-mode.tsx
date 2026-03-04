"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getLastWeight,
  checkAndUpdatePRs,
  type WorkoutExerciseLog,
  type WorkoutSetLog,
  type WorkoutLog,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Calculator,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { RestTimer } from "@/components/workout/rest-timer";
import { PlateCalculator } from "@/components/workout/plate-calculator";
import { SpotifyPlayer } from "@/components/workout/spotify-player";

interface SavedWorkoutSession {
  routineId: number;
  exerciseLogs: WorkoutExerciseLog[];
  currentExIndex: number;
  elapsed: number;
  startedAt: number; // Date.now() cuando empezó
}

function sessionKey(id: number) {
  return `workout_active_${id}`;
}

export function WorkoutMode({ routineId }: { routineId: number }) {
  const router = useRouter();
  const routine = useLiveQuery(() => db.routines.get(routineId));

  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [exerciseLogs, setExerciseLogs] = useState<WorkoutExerciseLog[]>([]);
  const [showRest, setShowRest] = useState(false);
  const [restKey, setRestKey] = useState(0);
  const [restDuration, setRestDuration] = useState(150);
  const [weightUpdated, setWeightUpdated] = useState(false);
  const [newPRs, setNewPRs] = useState<string[]>([]);
  const [showPR, setShowPR] = useState(false);
  const [finished, setFinished] = useState(false);
  const startTimeRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session guardada para reanudar entrenamiento
  const [savedSession, setSavedSession] = useState<SavedWorkoutSession | null>(null);

  // Refs para Page Visibility API (evitan stale closures en el listener)
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const finishedRef = useRef(false);
  const elapsedRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

  // Swap features
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [newExName, setNewExName] = useState("");
  const [newExMuscle, setNewExMuscle] = useState("Pecho");

  // Plate Calculator
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  // Save Weight Dialog
  const [isSaveWeightOpen, setIsSaveWeightOpen] = useState(false);
  const [manualWeight, setManualWeight] = useState("");
  const [manualUnit, setManualUnit] = useState("kg");

  // Inicializar logs desde la rutina (solo pesos del historial, sin sesión guardada)
  function initFromRoutine(r: NonNullable<typeof routine>) {
    const initLogs: WorkoutExerciseLog[] = r.exercises.map((ex) => ({
      exerciseId: ex.id,
      exerciseName: ex.name,
      muscleGroup: ex.muscleGroup,
      supersetId: ex.supersetId,
      sets: Array.from({ length: ex.sets }, (_, i) => ({
        setNumber: i + 1,
        weight: ex.targetWeight,
        unit: ex.unit || "kg",
        reps: ex.reps,
        rpe: "normal" as const,
        completed: false,
      })),
    }));

    setRestDuration(r.exercises[0]?.restSeconds ?? 150);

    Promise.all(r.exercises.map((ex) => getLastWeight(ex.name))).then(
      (weights) => {
        weights.forEach((w, i) => {
          if (w > 0) initLogs[i].sets.forEach((s) => { s.weight = w; });
        });
        setExerciseLogs([...initLogs]);
      },
    );
  }

  // Al cargar la rutina: verificar si hay sesión guardada
  useEffect(() => {
    if (!routine) return;

    try {
      const raw = localStorage.getItem(sessionKey(routine.id!));
      if (raw) {
        const session: SavedWorkoutSession = JSON.parse(raw);
        if (session.routineId === routine.id && session.exerciseLogs?.length > 0) {
          setSavedSession(session);
          return; // Esperar a que el usuario elija reanudar o empezar nuevo
        }
      }
    } catch {
      localStorage.removeItem(sessionKey(routine.id!));
    }

    initFromRoutine(routine);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routine?.id]);

  const groupedLogs = useMemo(() => {
    const groups: { index: number; log: WorkoutExerciseLog }[][] = [];
    exerciseLogs.forEach((log, index) => {
      if (log.supersetId) {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup[0]?.log.supersetId === log.supersetId) {
          lastGroup.push({ index, log });
        } else {
          groups.push([{ index, log }]);
        }
      } else {
        groups.push([{ index, log }]);
      }
    });
    return groups;
  }, [exerciseLogs]);

  const currentGroup = groupedLogs[currentExIndex] || [];

  // Update rest duration when changing exercises
  useEffect(() => {
    if (routine && currentGroup.length > 0) {
      const currentExercise = currentGroup[0]?.log;
      if (currentExercise) {
        const originalExercise = routine.exercises.find(
          (e) => e.id === currentExercise.exerciseId,
        );
        if (originalExercise) {
          setRestDuration(originalExercise.restSeconds ?? 150);
        }
      }
    }
  }, [currentExIndex, routine]);

  // Helper to group exercises for pre-start view
  const preStartGroups = useMemo(() => {
    if (!routine?.exercises) return [];
    const groups: {
      exercise: (typeof routine.exercises)[0];
      isSuperset: boolean;
    }[] = [];
    routine.exercises.forEach((ex, index) => {
      const prevEx = index > 0 ? routine.exercises[index - 1] : null;
      const isSuperset =
        prevEx?.supersetId && prevEx.supersetId === ex.supersetId;
      groups.push({ exercise: ex, isSuperset });
    });
    return groups;
  }, [routine?.exercises]);

  // Timer principal
  useEffect(() => {
    if (started && !paused && !finished) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [started, paused, finished]);

  // Mantener refs sincronizados para usarlos sin stale closures
  useEffect(() => { startedRef.current = started; }, [started]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { finishedRef.current = finished; }, [finished]);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Page Visibility API — corrige el timer cuando el usuario vuelve al navegador
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        if (
          hiddenAtRef.current !== null &&
          startedRef.current &&
          !pausedRef.current &&
          !finishedRef.current
        ) {
          const secondsGone = Math.floor((Date.now() - hiddenAtRef.current) / 1000);
          if (secondsGone > 0) {
            setElapsed((prev) => prev + secondsGone);
          }
        }
        hiddenAtRef.current = null;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []); // mount once — usa refs para evitar stale closures

  // Auto-guardar sesión en localStorage cuando cambia el progreso
  useEffect(() => {
    if (!started || finished || !routine?.id || !startTimeRef.current) return;
    const session: SavedWorkoutSession = {
      routineId: routine.id,
      exerciseLogs,
      currentExIndex,
      elapsed: elapsedRef.current,
      startedAt: startTimeRef.current.getTime(),
    };
    try {
      localStorage.setItem(sessionKey(routine.id), JSON.stringify(session));
    } catch {
      // localStorage lleno — ignorar
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseLogs, currentExIndex]); // se activa cuando hay progreso real

  function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function handleResumeWorkout() {
    if (!savedSession || !routine) return;
    setExerciseLogs(savedSession.exerciseLogs);
    setCurrentExIndex(savedSession.currentExIndex);
    setElapsed(savedSession.elapsed);
    setRestDuration(routine.exercises[savedSession.currentExIndex]?.restSeconds ?? 150);
    startTimeRef.current = new Date(savedSession.startedAt);
    setStarted(true);
    setSavedSession(null);
  }

  function handleDiscardSession() {
    if (!routine) return;
    localStorage.removeItem(sessionKey(routine.id!));
    setSavedSession(null);
    initFromRoutine(routine);
  }

  function handleStart() {
    setStarted(true);
    startTimeRef.current = new Date();
  }

  function updateSet(
    exIndex: number,
    setIndex: number,
    field: keyof WorkoutSetLog,
    value: unknown,
  ) {
    setExerciseLogs((prev) => {
      const updated = [...prev];
      const sets = [...updated[exIndex].sets];
      sets[setIndex] = { ...sets[setIndex], [field]: value };
      updated[exIndex] = { ...updated[exIndex], sets };
      return updated;
    });
  }

  // Handle weight input - allows empty values
  function handleWeightChange(
    exIndex: number,
    setIndex: number,
    value: string,
  ) {
    setExerciseLogs((prev) => {
      const updated = [...prev];
      const sets = [...updated[exIndex].sets];
      // Allow empty string, convert to number or keep empty
      const numValue = value === "" ? "" : parseFloat(value);
      const finalWeight = isNaN(Number(numValue)) ? 0 : numValue;
      sets[setIndex] = {
        ...sets[setIndex],
        weight: finalWeight,
      };
      updated[exIndex] = { ...updated[exIndex], sets };
      return updated;
    });
  }

  function handleSwapExercise() {
    if (!newExName.trim() || swapIndex === null) return;
    setExerciseLogs((prev) => {
      const updated = [...prev];
      updated[swapIndex] = {
        ...updated[swapIndex],
        exerciseName: newExName.trim(),
        muscleGroup: newExMuscle,
      };
      return updated;
    });
    setIsSwapOpen(false);
    setNewExName("");
    setSwapIndex(null);
  }

  async function completeSet(exIndex: number, setIndex: number) {
    const exLog = exerciseLogs[exIndex];
    if (!exLog) return;

    const currentSet = exLog.sets[setIndex];
    if (!currentSet) return;

    // Capturar peso antes del state update para evitar stale closure
    const currentWeight =
      currentSet.weight === "" ? 0 : Number(currentSet.weight) || 0;

    // Marcar el set como completado
    updateSet(exIndex, setIndex, "completed", true);

    // Construir lista de sets completados incluyendo el que acabamos de completar
    // (no leer de exerciseLogs porque el state update aún no se aplicó)
    const alreadyCompleted = exLog.sets.filter(
      (s, i) => s.completed && i !== setIndex,
    );
    const completedSets = [
      ...alreadyCompleted,
      { ...currentSet, completed: true, weight: currentWeight },
    ];

    // Verificar PRs con los datos correctos
    const prs = await checkAndUpdatePRs(
      exLog.exerciseName,
      completedSets,
      exLog.muscleGroup,
    );
    if (prs.length > 0) {
      setNewPRs(prs.map((p) => `${p.exerciseName}: ${p.details}`));
      setShowPR(true);
      setTimeout(() => setShowPR(false), 3000);
    }

    // Obtener duración de descanso para este ejercicio
    if (routine) {
      const originalExercise = routine.exercises.find(
        (e) => e.id === exLog.exerciseId,
      );
      if (originalExercise) {
        setRestDuration(originalExercise.restSeconds ?? 150);
      }
    }

    // Reiniciar timer (key increment fuerza remount de RestTimer)
    setRestKey((k) => k + 1);
    setShowRest(true);
  }

  async function saveManualWeight() {
    if (!routine || currentGroup.length === 0) return;

    const weight = parseFloat(manualWeight) || 0;

    const updatedExercises = routine.exercises.map((ex) => {
      const match = currentGroup.find((g) => g.log.exerciseId === ex.id);
      if (match) {
        return { ...ex, targetWeight: weight, unit: manualUnit };
      }
      return ex;
    });

    await db.routines.update(routine.id!, { exercises: updatedExercises });

    // Also update live exerciseLogs so unit change is immediately reflected
    currentGroup.forEach(({ index: exIdx }) => {
      setExerciseLogs((prev) => {
        const updated = [...prev];
        const sets = updated[exIdx].sets.map((s) => ({ ...s, unit: manualUnit }));
        updated[exIdx] = { ...updated[exIdx], sets };
        return updated;
      });
    });

    setWeightUpdated(true);
    setIsSaveWeightOpen(false);
    setManualWeight("");
    setTimeout(() => setWeightUpdated(false), 2000);
  }

  async function handleFinish() {
    if (!routine || !startTimeRef.current) return;

    const endTime = new Date();
    const log: Omit<WorkoutLog, "id"> = {
      routineId: routine.id!,
      routineName: routine.name,
      date: endTime,
      startTime: startTimeRef.current,
      endTime,
      duration: elapsed,
      completed: true,
      exercises: exerciseLogs,
    };

    try {
      await db.workoutLogs.add(log as WorkoutLog);
      // Limpiar sesión guardada al terminar con éxito
      localStorage.removeItem(sessionKey(routine.id!));
      setFinished(true);
    } catch (err) {
      console.error("Error guardando el entrenamiento:", err);
      alert("No se pudo guardar el entrenamiento. Intenta de nuevo.");
    }
  }

  const totalSets =
    exerciseLogs.length > 0
      ? exerciseLogs.reduce((s, e) => s + e.sets.length, 0)
      : 0;
  const completedSets =
    exerciseLogs.length > 0
      ? exerciseLogs.reduce(
          (s, e) => s + e.sets.filter((set) => set.completed).length,
          0,
        )
      : 0;
  const overallProgress = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  // For supersets: only show progress when SAME set number is completed in ALL exercises
  const supersetProgress = useMemo(() => {
    if (currentGroup.length <= 1) return null;
    const completedPerExercise = currentGroup.map(
      (g) => g.log.sets.filter((s) => s.completed).length,
    );
    const minCompleted = Math.min(...completedPerExercise);
    const allSame = completedPerExercise.every(
      (count) => count === minCompleted,
    );
    if (!allSame || minCompleted === 0) return null;
    return { completed: minCompleted, total: currentGroup.length };
  }, [currentGroup]);

  if (!routine) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando rutina...</p>
      </div>
    );
  }

  // Finished screen
  if (finished) {
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
    );
  }

  // Pantalla de sesión guardada — reanudar o empezar nuevo
  if (!started && savedSession) {
    const completedCount = savedSession.exerciseLogs.reduce(
      (acc, ex) => acc + ex.sets.filter((s) => s.completed).length,
      0,
    );
    const totalCount = savedSession.exerciseLogs.reduce(
      (acc, ex) => acc + ex.sets.length,
      0,
    );
    const savedElapsedStr = formatTime(savedSession.elapsed);

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

        <div className="flex flex-1 flex-col items-center justify-center px-6 gap-6">
          <div className="w-full max-w-sm rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
              <Timer className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">
              Entrenamiento en curso
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Tenés progreso guardado de esta rutina
            </p>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="rounded-xl bg-card border border-border p-3">
                <p className="text-xs text-muted-foreground">Series</p>
                <p className="text-xl font-bold text-foreground">
                  {completedCount}/{totalCount}
                </p>
              </div>
              <div className="rounded-xl bg-card border border-border p-3">
                <p className="text-xs text-muted-foreground">Tiempo</p>
                <p className="text-xl font-bold text-foreground">
                  {savedElapsedStr}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm flex flex-col gap-3">
            <Button
              onClick={handleResumeWorkout}
              className="w-full rounded-xl py-6 text-base font-bold"
              size="lg"
            >
              <Play className="mr-2 h-5 w-5" />
              Retomar entrenamiento
            </Button>
            <Button
              variant="outline"
              onClick={handleDiscardSession}
              className="w-full rounded-xl py-5 text-base"
              size="lg"
            >
              Empezar de nuevo
            </Button>
          </div>
        </div>
      </div>
    );
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
            {preStartGroups.map((item, i) => {
              const nextEx = routine.exercises[i + 1];
              const isStartOfSuperset: boolean =
                !item.isSuperset &&
                i < routine.exercises.length - 1 &&
                !!nextEx?.supersetId &&
                nextEx.supersetId === item.exercise.supersetId;

              if (item.isSuperset) {
                return (
                  <div
                    key={item.exercise.id}
                    className="flex items-center gap-2 pl-4"
                  >
                    <span className="text-primary font-bold">+</span>
                    <Card className="flex-1 border-primary/30 bg-primary/5">
                      <CardContent className="flex items-center justify-between p-3 py-2">
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {item.exercise.name}
                          </p>
                        </div>
                        <p className="text-xs font-medium text-muted-foreground">
                          {item.exercise.sets}x{item.exercise.reps}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              if (isStartOfSuperset) {
                return (
                  <div key={item.exercise.id} className="relative">
                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center z-10">
                      <span className="text-[10px] font-bold text-primary">
                        SS
                      </span>
                    </div>
                    <Card className="border-primary/30 bg-primary/5">
                      <CardContent className="flex items-center justify-between p-3">
                        <div>
                          <p className="font-medium text-foreground">
                            {item.exercise.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.exercise.muscleGroup}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {item.exercise.sets}x{item.exercise.reps}{" "}
                          {item.exercise.targetWeight > 0
                            ? `@ ${item.exercise.targetWeight}kg`
                            : ""}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              return (
                <Card key={item.exercise.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {item.exercise.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.exercise.muscleGroup}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {item.exercise.sets}x{item.exercise.reps}{" "}
                      {item.exercise.targetWeight > 0
                        ? `@ ${item.exercise.targetWeight}kg`
                        : ""}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
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
    );
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
          key={restKey}
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
            if (confirm("Cancelar entrenamiento?")) router.push("/");
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCalculatorOpen(true)}
            title="Calculadora de discos"
          >
            <Calculator className="h-4 w-4" />
          </Button>
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
      </div>

      {/* Progress */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progreso</span>
          {supersetProgress ? (
            <span>
              {supersetProgress.completed} serie de {supersetProgress.total}{" "}
              ejercicios
            </span>
          ) : (
            <span>
              {completedSets}/{totalSets} series
            </span>
          )}
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
        <div className="text-center flex flex-col items-center">
          <p className="text-xs text-muted-foreground">
            {currentExIndex + 1} / {groupedLogs.length}
          </p>
          {currentGroup.length > 1 ? (
            <div className="flex flex-col items-center">
              <h2 className="text-xl font-bold text-foreground leading-tight text-center">
                Súper Serie
              </h2>
              <p className="text-xs text-muted-foreground mt-1 text-center font-medium">
                {currentGroup.map((g) => g.log.exerciseName).join(" + ")}
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-foreground">
                {currentGroup[0]?.log.exerciseName}
              </h2>
              <p className="text-xs text-muted-foreground">
                {currentGroup[0]?.log.muscleGroup}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSwapIndex(currentGroup[0]?.index);
                  setNewExName(currentGroup[0]?.log.exerciseName || "");
                  setNewExMuscle(currentGroup[0]?.log.muscleGroup || "Pecho");
                  setIsSwapOpen(true);
                }}
                className="h-6 px-2 mt-1 text-xs text-primary"
              >
                Sustituir
              </Button>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={currentExIndex === groupedLogs.length - 1}
          onClick={() => setCurrentExIndex((p) => p + 1)}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Sets */}
      <div className={cn("flex-1 overflow-auto px-4 pt-4", showRest && "pb-44")}>
        {currentGroup.map(({ index: flatIndex, log }) => {
          const maxWeight = Math.max(
            ...log.sets.map((s) => {
              const w = s.weight === "" ? 0 : Number(s.weight);
              return w;
            }),
          );

          return (
            <div key={flatIndex} className="mb-6 relative">
              {currentGroup.length > 1 && (
                <div className="flex flex-col items-center justify-center mb-3">
                  <h3 className="font-bold text-sm text-foreground">
                    {log.exerciseName}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-1">
                    {log.muscleGroup}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSwapIndex(flatIndex);
                        setNewExName(log.exerciseName || "");
                        setNewExMuscle(log.muscleGroup || "Pecho");
                        setIsSwapOpen(true);
                      }}
                      className="h-6 px-2 text-xs text-primary"
                    >
                      Sustituir
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSwapIndex(flatIndex);
                        setManualWeight(
                          maxWeight > 0 ? maxWeight.toString() : "",
                        );
                        setManualUnit(log.sets[0]?.unit || "kg");
                        setIsSaveWeightOpen(true);
                      }}
                      className="h-6 px-2 text-xs text-muted-foreground"
                    >
                      {weightUpdated ? "¡Guardado!" : "Guardar peso"}
                    </Button>
                  </div>
                </div>
              )}
              <div className="mb-2 grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <span className="col-span-2 text-center">Set</span>
                <span className="col-span-5 text-center">Peso</span>
                <span className="col-span-3 text-center">Reps</span>
                <span className="col-span-2 text-center">OK</span>
              </div>
              {log.sets.map((set, si) => {
                const weightValue = set.weight === "" ? 0 : Number(set.weight);
                const isCompleted = Boolean(set.completed);
                return (
                  <div
                    key={si}
                    className={cn(
                      "mb-2 grid grid-cols-12 items-center gap-2 rounded-lg p-2",
                      isCompleted ? "bg-success/10" : "bg-card",
                    )}
                  >
                    <span className="col-span-2 text-center text-sm font-bold text-muted-foreground">
                      {set.setNumber}
                    </span>
                    <div className="col-span-5 flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={weightValue === 0 ? "" : weightValue}
                        onChange={(e) =>
                          handleWeightChange(flatIndex, si, e.target.value)
                        }
                        disabled={isCompleted}
                        className="h-9 min-w-0 flex-1 text-center text-sm px-1"
                        placeholder="0"
                      />
                      <Select
                        value={set.unit}
                        onValueChange={(val) =>
                          updateSet(flatIndex, si, "unit", val)
                        }
                        disabled={isCompleted}
                      >
                        <SelectTrigger className="h-9 w-14 shrink-0 px-1.5 text-xs font-bold uppercase text-muted-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[70]">
                          <SelectItem value="kg">kg</SelectItem>
                          <SelectItem value="lb">lb</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="text"
                        value={set.reps}
                        onChange={(e) =>
                          updateSet(flatIndex, si, "reps", e.target.value)
                        }
                        disabled={isCompleted}
                        className="h-9 text-center text-sm"
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      {isCompleted ? (
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-success hover:bg-success/70 active:scale-95 transition-all"
                          onClick={() => updateSet(flatIndex, si, "completed", false)}
                          title="Toca para desmarcar"
                        >
                          <Check className="h-4 w-4 text-success-foreground" />
                        </button>
                      ) : (
                        <Button
                          size="icon"
                          className="h-9 w-9 rounded-full"
                          onClick={() => completeSet(flatIndex, si)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Single exercise: show save button below sets */}
              {currentGroup.length === 1 && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const maxWeightSingle = Math.max(
                        ...currentGroup.flatMap((g) =>
                          g.log.sets.map((s) => {
                            const w = s.weight === "" ? 0 : Number(s.weight);
                            return w;
                          }),
                        ),
                      );
                      setManualWeight(
                        maxWeightSingle > 0 ? maxWeightSingle.toString() : "",
                      );
                      setManualUnit(currentGroup[0]?.log.sets[0]?.unit || "kg");
                      setIsSaveWeightOpen(true);
                    }}
                    disabled={weightUpdated}
                    className="text-xs text-muted-foreground w-full max-w-[200px]"
                  >
                    {weightUpdated
                      ? "¡Peso Guardado!"
                      : "Guardar peso como base"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
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
        ) : currentGroup.every((g) => g.log.sets.every((s) => s.completed)) &&
          currentExIndex < groupedLogs.length - 1 ? (
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

      {/* Swap Exercise Dialog */}
      <Dialog open={isSwapOpen} onOpenChange={setIsSwapOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-xl z-[60]">
          <DialogHeader>
            <DialogTitle>Sustituir Ejercicio</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Nuevo Ejercicio</label>
              <Input
                placeholder="Ej. Press inclinado"
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Grupo Muscular</label>
              <Select value={newExMuscle} onValueChange={setNewExMuscle}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent className="z-[70]">
                  <SelectItem value="Pecho">Pecho</SelectItem>
                  <SelectItem value="Espalda">Espalda</SelectItem>
                  <SelectItem value="Piernas">Piernas</SelectItem>
                  <SelectItem value="Hombros">Hombros</SelectItem>
                  <SelectItem value="Brazos">Brazos</SelectItem>
                  <SelectItem value="Core">Core</SelectItem>
                  <SelectItem value="Cardio">Cardio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsSwapOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSwapExercise} disabled={!newExName.trim()}>
              Sustituir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Weight Dialog */}
      <Dialog open={isSaveWeightOpen} onOpenChange={setIsSaveWeightOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-xl z-[60]">
          <DialogHeader>
            <DialogTitle>Guardar Peso Base</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                Peso base para esta rutina
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Peso"
                  value={manualWeight}
                  onChange={(e) => setManualWeight(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Select value={manualUnit} onValueChange={setManualUnit}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[70]">
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsSaveWeightOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={saveManualWeight}
              disabled={!manualWeight || parseFloat(manualWeight) <= 0}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plate Calculator Dialog */}
      <PlateCalculator
        open={isCalculatorOpen}
        onOpenChange={setIsCalculatorOpen}
        defaultUnit={currentGroup[0]?.log.sets[0]?.unit || "kg"}
      />

      {/* Spotify Player - Floating widget during workout */}
      <SpotifyPlayer />
    </div>
  );
}
