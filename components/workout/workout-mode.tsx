"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getLastWeight,
  getLastRecommendation,
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
  Share2,
  NotebookPen,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { RestTimer } from "@/components/workout/rest-timer";
import { PlateCalculator } from "@/components/workout/plate-calculator";
import {
  getRPERecommendation,
  RPE_LABELS,
  RPE_COLORS,
  RECOMMENDATION_COLORS,
  type RPEValue,
  type SetAnalysis,
} from "@/lib/rpe-engine";

interface SavedWorkoutSession {
  routineId: number;
  exerciseLogs: WorkoutExerciseLog[];
  currentExIndex: number;
  /** Absolute ms timestamp when the workout started (Date.now()). */
  startedAt: number;
  /** Accumulated ms spent paused — subtracted from total elapsed. */
  pausedAccumMs: number;
  /** If currently paused, ms timestamp when pause began; null otherwise. */
  pausedAt: number | null;
}

function sessionKey(id: number) {
  return `workout_active_${id}`;
}

/** Compute elapsed seconds using Date.now() — immune to setInterval drift/throttling. */
function computeElapsed(
  startedAt: number | null,
  pausedAccumMs: number,
  pausedAt: number | null,
): number {
  if (!startedAt) return 0;
  const now = Date.now();
  const currentPauseMs = pausedAt !== null ? now - pausedAt : 0;
  const ms = now - startedAt - pausedAccumMs - currentPauseMs;
  return Math.max(0, Math.floor(ms / 1000));
}

export function WorkoutMode({ routineId }: { routineId: number }) {
  const router = useRouter();
  const routine = useLiveQuery(() => db.routines.get(routineId));

  const [started, setStarted] = useState(false);
  const [currentExIndex, setCurrentExIndex] = useState(0);
  const [exerciseLogs, setExerciseLogs] = useState<WorkoutExerciseLog[]>([]);
  const [showRest, setShowRest] = useState(false);
  const [restKey, setRestKey] = useState(0);
  const [restDuration, setRestDuration] = useState(150);
  const [weightUpdated, setWeightUpdated] = useState(false);

  const [finished, setFinished] = useState(false);
  const [notes, setNotes] = useState("");
  const [savedLogId, setSavedLogId] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Timer state — Date.now()-based. `tick` forces re-render once per second.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedAccumMs, setPausedAccumMs] = useState(0);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // Derived elapsed seconds — computed fresh on every render, never drifts
  const elapsed = computeElapsed(startedAt, pausedAccumMs, pausedAt);
  const paused = pausedAt !== null;

  // Session guardada para reanudar entrenamiento
  const [savedSession, setSavedSession] = useState<SavedWorkoutSession | null>(null);

  // Swap features
  const [isSwapOpen, setIsSwapOpen] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [newExName, setNewExName] = useState("");
  const [newExMuscle, setNewExMuscle] = useState("Pecho");

  // Plate Calculator
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  // Confirm early finish
  const [isConfirmFinishOpen, setIsConfirmFinishOpen] = useState(false);

  // Confirm exit (Salir button)
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);

  // Save Weight Dialog
  const [isSaveWeightOpen, setIsSaveWeightOpen] = useState(false);
  const [manualWeight, setManualWeight] = useState("");
  const [manualUnit, setManualUnit] = useState("kg");

  // Pesos de la última sesión por ejercicio (para sugerencia de progresión)
  const lastWeightsRef = useRef<Map<string, number>>(new Map());
  // Recomendaciones del último entreno por ejercicio
  const lastRecsRef = useRef<Map<string, { headline: string; detail: string; emoji: string; color: string }>>(new Map());

  // Inicializar logs desde la rutina (solo pesos del historial, sin sesión guardada).
  // Reps start empty so the routine's target shows as a placeholder — user types
  // the reps actually performed each set.
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
        reps: "",
        completed: false,
      })),
    }));

    setRestDuration(r.exercises[0]?.restSeconds ?? 150);

    Promise.all([
      Promise.all(r.exercises.map((ex) => getLastWeight(ex.name))),
      Promise.all(r.exercises.map((ex) => getLastRecommendation(ex.name))),
    ]).then(([weights, recs]) => {
      weights.forEach((w, i) => {
        if (w > 0) {
          initLogs[i].sets.forEach((s) => { s.weight = w; });
          lastWeightsRef.current.set(r.exercises[i].name, w);
        }
      });
      recs.forEach((rec, i) => {
        if (rec) lastRecsRef.current.set(r.exercises[i].name, rec);
      });
      setExerciseLogs([...initLogs]);
    });
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
        !!(prevEx?.supersetId && prevEx.supersetId === ex.supersetId);
      groups.push({ exercise: ex, isSuperset });
    });
    return groups;
  }, [routine?.exercises]);

  // Re-render tick (1 Hz). No math happens here — elapsed is derived from
  // Date.now() on every render, so background throttling cannot cause drift.
  useEffect(() => {
    if (!started || finished) return;
    const id = setInterval(() => setTick((t) => (t + 1) & 0xffff), 1000);
    return () => clearInterval(id);
  }, [started, finished]);

  // Re-sync immediately when the tab becomes visible again (throttled intervals
  // don't fire in background, but the next tick may be up to 1s late).
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) setTick((t) => (t + 1) & 0xffff);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Auto-persist session whenever progress changes. Uses absolute timestamps
  // so a reload recomputes elapsed correctly regardless of how long the app
  // was closed.
  useEffect(() => {
    if (!started || finished || !routine?.id || startedAt === null) return;
    const session: SavedWorkoutSession = {
      routineId: routine.id,
      exerciseLogs,
      currentExIndex,
      startedAt,
      pausedAccumMs,
      pausedAt,
    };
    try {
      localStorage.setItem(sessionKey(routine.id), JSON.stringify(session));
    } catch {
      // localStorage lleno — ignorar
    }
  }, [exerciseLogs, currentExIndex, started, finished, routine?.id, startedAt, pausedAccumMs, pausedAt]);

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
    const safeIndex = Math.min(savedSession.currentExIndex, savedSession.exerciseLogs.length - 1);
    setExerciseLogs(savedSession.exerciseLogs);
    setCurrentExIndex(Math.max(0, safeIndex));
    setRestDuration(routine.exercises[safeIndex]?.restSeconds ?? 150);
    setStartedAt(savedSession.startedAt);
    setPausedAccumMs(savedSession.pausedAccumMs ?? 0);
    setPausedAt(savedSession.pausedAt ?? null);
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
    setStartedAt(Date.now());
    setPausedAccumMs(0);
    setPausedAt(null);
    setStarted(true);
  }

  function togglePause() {
    setPausedAt((current) => {
      if (current === null) {
        // Begin pause
        return Date.now();
      }
      // End pause — accumulate the time we spent paused
      const pausedFor = Date.now() - current;
      setPausedAccumMs((prev) => prev + pausedFor);
      return null;
    });
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
    rawValue: string,
  ) {
    // Normalize comma to dot (e.g. "17,5" → "17.5")
    const value = rawValue.replace(",", ".");
    // Allow empty, digits, and a single decimal point (e.g. "12.", "12.5")
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    setExerciseLogs((prev) => {
      const updated = [...prev];
      const sets = [...updated[exIndex].sets];
      // Keep raw string while typing (preserves trailing dot), convert to number when complete
      let finalWeight: number | string;
      if (value === "" || value === ".") {
        finalWeight = "";
      } else if (value.endsWith(".") || value.endsWith(".0")) {
        finalWeight = value; // preserve "12." or "12.0" during typing
      } else {
        const parsed = parseFloat(value);
        finalWeight = isNaN(parsed) ? 0 : parsed;
      }
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
      if (swapIndex < 0 || swapIndex >= prev.length) return prev;
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

    // Parse reps as decimal (supports partial reps like 7.5)
    const rawReps = currentSet.reps;
    const repsStr = typeof rawReps === "string" ? rawReps.replace(",", ".").trim() : String(rawReps);
    const currentReps = repsStr === "" ? 0 : parseFloat(repsStr) || 0;

    // Require reps to be entered — placeholder shows target, user must type actual reps
    if (currentReps <= 0) {
      toast.error("Anota las reps realizadas antes de marcar la serie.");
      return;
    }

    // Validar peso 0
    if (currentWeight === 0) {
      const ok = window.confirm("Completar serie sin peso registrado. ¿Continuar?");
      if (!ok) return;
    }

    // Marcar el set como completado (normalizar peso y reps a número)
    setExerciseLogs((prev) => {
      const updated = [...prev];
      const sets = [...updated[exIndex].sets];
      sets[setIndex] = {
        ...sets[setIndex],
        weight: currentWeight,
        reps: currentReps,
        completed: true,
      };
      updated[exIndex] = { ...updated[exIndex], sets };
      return updated;
    });

    // Construir lista de sets completados incluyendo el que acabamos de completar
    // (no leer de exerciseLogs porque el state update aún no se aplicó)
    const alreadyCompleted = exLog.sets.filter(
      (s, i) => s.completed && i !== setIndex,
    );
    const completedSets = [
      ...alreadyCompleted,
      { ...currentSet, completed: true, weight: currentWeight, reps: currentReps },
    ];

    // Verificar PRs con los datos correctos
    const prs = await checkAndUpdatePRs(
      exLog.exerciseName,
      completedSets,
      exLog.muscleGroup,
    );
    if (prs.length > 0) {
      prs.forEach((p, i) => {
        setTimeout(() => {
          toast.custom(() => (
            <div className="flex items-center gap-3 rounded-2xl border border-yellow-500/30 bg-card px-4 py-3 shadow-2xl">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-500/15">
                <Trophy className="h-5 w-5 text-yellow-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-yellow-500">¡Nuevo Récord!</p>
                <p className="truncate text-sm font-semibold text-foreground">{p.exerciseName}</p>
                <p className="text-xs text-muted-foreground">{p.details}</p>
              </div>
            </div>
          ), { duration: 4500, position: "top-center" });
        }, i * 600);
      });
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

    // Determine which exercise to update: swapIndex for supersets, otherwise the only exercise
    const targetFlatIndex =
      swapIndex !== null ? swapIndex : currentGroup[0]?.index ?? 0;
    const targetLog = exerciseLogs[targetFlatIndex];

    const updatedExercises = routine.exercises.map((ex) => {
      if (ex.id === targetLog?.exerciseId) {
        return { ...ex, targetWeight: weight, unit: manualUnit };
      }
      return ex;
    });

    await db.routines.update(routine.id!, { exercises: updatedExercises });

    // Update live exerciseLogs: only the selected exercise
    setExerciseLogs((prev) => {
      if (targetFlatIndex < 0 || targetFlatIndex >= prev.length) return prev;
      const updated = [...prev];
      const sets = updated[targetFlatIndex].sets.map((s) => ({
        ...s,
        unit: manualUnit,
        weight: s.completed ? s.weight : weight,
      }));
      updated[targetFlatIndex] = { ...updated[targetFlatIndex], sets };
      return updated;
    });

    setWeightUpdated(true);
    setIsSaveWeightOpen(false);
    setManualWeight("");
    setTimeout(() => setWeightUpdated(false), 2000);
  }

  async function handleFinish() {
    if (!routine || startedAt === null) return;
    if (isFinishing) return; // guard against double-tap
    setIsFinishing(true);

    // Normalize data before saving. Weight and reps both accept decimals
    // (user may log partial reps like 7.5).
    const normalizedLogs = exerciseLogs.map((exLog) => ({
      ...exLog,
      sets: exLog.sets.map((s) => {
        const weightNum = typeof s.weight === "string"
          ? (parseFloat(s.weight.replace(",", ".")) || 0)
          : (s.weight ?? 0);
        const repsNum = typeof s.reps === "string"
          ? (parseFloat(s.reps.replace(",", ".")) || 0)
          : (s.reps ?? 0);
        return { ...s, weight: weightNum, reps: repsNum };
      }),
    }));

    // Attach RPE recommendations to each exercise before saving
    const exercisesWithRecs = normalizedLogs.map((exLog) => {
      const routineEx = routine.exercises.find((ex) => ex.id === exLog.exerciseId);
      const completedSets = exLog.sets.filter((s) => s.completed);
      if (completedSets.length === 0) return exLog;
      const setsForEngine: SetAnalysis[] = completedSets.map((s) => ({
        weight: Number(s.weight) || 0,
        unit: s.unit ?? "kg",
        reps: s.reps,
        targetReps: routineEx?.reps,
        rpe: s.rpe as RPEValue | undefined,
        completed: true,
      }));
      const rec = getRPERecommendation(exLog.muscleGroup ?? "", exLog.exerciseName ?? "", setsForEngine);
      if (rec) {
        return { ...exLog, lastRecommendation: { headline: rec.headline, detail: rec.detail, emoji: rec.emoji, color: rec.color } };
      }
      return exLog;
    });

    const endTime = new Date();
    const startDate = new Date(startedAt);
    const log: Omit<WorkoutLog, "id"> = {
      routineId: routine.id!,
      routineName: routine.name,
      date: endTime,
      startTime: startDate,
      endTime,
      duration: elapsed,
      completed: true,
      exercises: exercisesWithRecs,
    };

    // Single transaction: workoutLog + any PR updates triggered at save time would go
    // here together. PRs are already written live in completeSet, so only workoutLogs
    // participates — but we still wrap it to future-proof and get atomic failure semantics.
    try {
      const newId = await db.transaction("rw", db.workoutLogs, async () => {
        return (await db.workoutLogs.add(log as WorkoutLog)) as number;
      });
      localStorage.removeItem(sessionKey(routine.id!));
      setSavedLogId(newId);
      setFinished(true);
    } catch (err) {
      console.error("Error guardando el entrenamiento:", err);
      toast.error("No se pudo guardar el entrenamiento.", {
        description: "Tu progreso sigue seguro. Intenta de nuevo.",
        duration: 6000,
      });
    } finally {
      setIsFinishing(false);
    }
  }

  function handleExitRequest(finishNow: boolean) {
    setIsExitConfirmOpen(false);
    if (finishNow) {
      handleFinish().then(() => {
        // handleFinish shows the finished screen on success; navigation happens from there
      });
    } else {
      // Leave the session in localStorage so it can be resumed later
      router.push("/");
    }
  }

  async function handleSaveNotes(text: string) {
    if (!savedLogId || !text.trim()) return;
    await db.workoutLogs.update(savedLogId, { notes: text.trim() });
  }

  function handleShare() {
    const dateStr = format(new Date(), "d 'de' MMMM yyyy", { locale: es });
    const durationStr = formatTime(elapsed);
    const exerciseLines = exerciseLogs
      .map((ex) => {
        const done = ex.sets.filter((s) => s.completed);
        const maxW = Math.max(...done.map((s) => Number(s.weight) || 0));
        return `• ${ex.exerciseName}: ${done.length} series${maxW > 0 ? ` @ ${maxW} kg` : ""}`;
      })
      .join("\n");
    const text = `🏋️ Entrenamiento completado — ${routine!.name}
📅 ${dateStr}
⏱️ Duración: ${durationStr}

💪 Ejercicios:
${exerciseLines}

📱 Cuti Traning`;

    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({ title: `Entrenamiento: ${routine!.name}`, text })
        .catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        toast.success("Resumen copiado al portapapeles");
      });
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
              <p className="text-xs text-muted-foreground">Duración</p>
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
        {/* Session notes */}
        <div className="mt-6 w-full max-w-xs">
          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <NotebookPen className="h-3.5 w-3.5" />
            Notas de la sesión
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => handleSaveNotes(notes)}
            placeholder="¿Cómo fue la sesión? (opcional)"
            className="w-full rounded-xl border bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-4 w-full max-w-xs flex flex-col gap-3">
          <Button
            onClick={() => handleShare()}
            variant="outline"
            className="w-full rounded-xl py-5 text-base gap-2"
            size="lg"
          >
            <Share2 className="h-4 w-4" />
            Compartir entrenamiento
          </Button>
          <Button
            onClick={() => router.push("/history")}
            variant="outline"
            className="w-full rounded-xl py-5 text-base gap-2"
            size="lg"
          >
            <ClipboardCheck className="h-4 w-4" />
            Ver Historial
          </Button>
          <Button
            onClick={async () => {
              await handleSaveNotes(notes);
              router.push("/");
            }}
            className="w-full rounded-xl py-6 text-base font-semibold"
            size="lg"
          >
            Volver al Dashboard
          </Button>
        </div>
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
    const savedElapsed = computeElapsed(
      savedSession.startedAt,
      savedSession.pausedAccumMs ?? 0,
      savedSession.pausedAt ?? null,
    );
    const savedElapsedStr = formatTime(savedElapsed);

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
                            ? `@ ${item.exercise.targetWeight} ${item.exercise.unit || "kg"}`
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
                        ? `@ ${item.exercise.targetWeight} ${item.exercise.unit || "kg"}`
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

      {/* Rest Timer Overlay — key is stable, restart via signal */}
      {showRest && (
        <RestTimer
          initialDuration={restDuration}
          restartSignal={restKey}
          onClose={() => setShowRest(false)}
        />
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          onClick={() => setIsExitConfirmOpen(true)}
        >
          <X className="mr-1 h-4 w-4" />
          Salir
        </Button>
        <div className="flex items-center gap-2">
          <Timer className={cn("h-4 w-4", paused ? "text-yellow-500" : "text-primary")} />
          <span className={cn("font-mono text-lg font-bold tabular-nums", paused ? "text-yellow-500" : "text-foreground")}>
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
            aria-label={paused ? "Reanudar cronómetro" : "Pausar cronómetro"}
            onClick={togglePause}
          >
            {paused ? (
              <Play className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Pause className="h-5 w-5" aria-hidden="true" />
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
              {(() => {
                const exName = currentGroup[0]?.log.exerciseName;
                const last = exName ? lastWeightsRef.current.get(exName) : undefined;
                if (!last) return null;
                const unit = currentGroup[0]?.log.sets[0]?.unit ?? "kg";
                return (
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Última: {last} {unit} · Sugerido: {Math.round((last + 2.5) * 10) / 10} {unit}
                  </p>
                );
              })()}
              {(() => {
                const exName = currentGroup[0]?.log.exerciseName;
                const allDone = currentGroup[0]?.log.sets.every((s) => s.completed);
                if (allDone) return null; // Don't show last rec if current exercise is done (show live rec instead)
                const rec = exName ? lastRecsRef.current.get(exName) : undefined;
                if (!rec) return null;
                return (
                  <div className={cn(
                    "mt-1.5 rounded-lg border px-2.5 py-1.5 text-left max-w-[260px]",
                    RECOMMENDATION_COLORS[rec.color as keyof typeof RECOMMENDATION_COLORS] || RECOMMENDATION_COLORS.blue,
                  )}>
                    <p className="text-[10px] font-semibold leading-tight">
                      {rec.emoji} Último entreno: {rec.headline}
                    </p>
                  </div>
                );
              })()}
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
                // Preserve raw string for display (allows "12." mid-typing)
                const weightDisplay = set.weight === "" ? "" : typeof set.weight === "string" ? set.weight : set.weight;
                const weightNumeric = set.weight === "" ? 0 : Number(set.weight) || 0;
                const isCompleted = Boolean(set.completed);
                return (
                  <div key={si} className="mb-2">
                    {/* Set row */}
                    <div
                      className={cn(
                        "grid grid-cols-12 items-center gap-2 rounded-lg p-2",
                        isCompleted ? "bg-success/10" : "bg-card",
                        isCompleted && "rounded-b-none",
                      )}
                    >
                      <span className="col-span-2 text-center text-sm font-bold text-muted-foreground">
                        {set.setNumber}
                      </span>
                      <div className="col-span-5 flex items-center gap-1">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={weightDisplay === "" || weightDisplay === 0 ? "" : weightDisplay}
                          onChange={(e) =>
                            handleWeightChange(flatIndex, si, e.target.value)
                          }
                          disabled={isCompleted}
                          aria-label={`Peso serie ${set.setNumber}`}
                          className="h-9 min-w-0 flex-1 text-center text-sm px-1"
                          placeholder="0"
                        />
                        <Select
                          value={set.unit}
                          onValueChange={(val) =>
                            setExerciseLogs((prev) => {
                              const updated = [...prev];
                              updated[flatIndex] = {
                                ...updated[flatIndex],
                                sets: updated[flatIndex].sets.map((s) => ({ ...s, unit: val })),
                              };
                              return updated;
                            })
                          }
                          disabled={isCompleted}
                        >
                          <SelectTrigger
                            aria-label={`Unidad serie ${set.setNumber}`}
                            className="h-9 w-14 shrink-0 px-1.5 text-xs font-bold uppercase text-muted-foreground"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-70">
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="lb">lb</SelectItem>
                            <SelectItem value="otro">otro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={typeof set.reps === "number" ? set.reps : set.reps}
                          onChange={(e) => {
                            const raw = e.target.value.replace(",", ".");
                            if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
                            updateSet(flatIndex, si, "reps", raw);
                          }}
                          disabled={isCompleted}
                          aria-label={`Reps serie ${set.setNumber}`}
                          placeholder={(() => {
                            const routineEx = routine.exercises.find(
                              (ex) => ex.id === log.exerciseId,
                            );
                            return routineEx?.reps ? String(routineEx.reps) : "—";
                          })()}
                          className="h-9 text-center text-sm"
                        />
                      </div>
                      <div className="col-span-2 flex justify-center">
                        {isCompleted ? (
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-success hover:bg-success/70 active:scale-95 transition-all"
                            onClick={() => updateSet(flatIndex, si, "completed", false)}
                            title="Toca para desmarcar"
                            aria-label="Desmarcar serie completada"
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

                    {/* RPE selector — appears below each completed set */}
                    {isCompleted && (
                      <div className="grid grid-cols-4 gap-0.5 rounded-b-lg bg-success/5 px-2 pb-2 pt-1">
                        {(["easy", "normal", "hard", "failure"] as RPEValue[]).map((rpe) => {
                          const info = RPE_LABELS[rpe];
                          const isSelected = set.rpe === rpe;
                          return (
                            <button
                              key={rpe}
                              type="button"
                              aria-label={`RPE: ${info.label} — ${info.description}`}
                              title={info.description}
                              onClick={() => updateSet(flatIndex, si, "rpe", rpe)}
                              className={cn(
                                "flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 text-[9px] font-semibold transition-all",
                                isSelected
                                  ? RPE_COLORS[rpe]
                                  : "border-transparent text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40",
                              )}
                            >
                              <span className="text-base leading-none">{info.emoji}</span>
                              <span className="leading-none">{info.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* RPE Recommendation — shown when all sets of this exercise are done */}
              {(() => {
                const allDone = log.sets.every((s) => s.completed);
                if (!allDone) return null;
                // Find the matching routine exercise to get target reps
                const routineExercise = routine.exercises.find(
                  (ex) => ex.id === log.exerciseId,
                );
                const setsForEngine: SetAnalysis[] = log.sets.map((s) => ({
                  weight: s.weight === "" ? 0 : Number(s.weight),
                  unit: s.unit ?? "kg",
                  reps: s.reps,
                  // Pass target reps from routine so the engine can compare actual vs target
                  targetReps: routineExercise?.reps,
                  // Don't default RPE — undefined means user didn't rate this set
                  rpe: s.rpe as RPEValue | undefined,
                  completed: Boolean(s.completed),
                }));
                const rec = getRPERecommendation(
                  log.muscleGroup ?? "",
                  log.exerciseName ?? "",
                  setsForEngine,
                );
                if (!rec) return null;
                return (
                  <div
                    className={cn(
                      "mt-3 rounded-xl border p-3 animate-in fade-in slide-in-from-bottom-2",
                      RECOMMENDATION_COLORS[rec.color],
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xl leading-none mt-0.5">{rec.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold leading-tight">{rec.headline}</p>
                        <p className="text-xs opacity-80 mt-1 leading-snug">{rec.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                      setSwapIndex(currentGroup[0]?.index ?? null);
                      setManualWeight(
                        maxWeightSingle > 0 ? maxWeightSingle.toString() : "",
                      );
                      setManualUnit(currentGroup[0]?.log.sets[0]?.unit || "kg");
                      setIsSaveWeightOpen(true);
                    }}
                    disabled={weightUpdated}
                    className="text-xs text-muted-foreground w-full max-w-50"
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
            disabled={isFinishing}
            className="w-full rounded-xl py-6 text-base font-bold bg-success text-success-foreground hover:bg-success/90"
            size="lg"
          >
            <Square className="mr-2 h-5 w-5" />
            {isFinishing ? "Guardando..." : "Finalizar Entrenamiento"}
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
            onClick={() => setIsConfirmFinishOpen(true)}
            variant="outline"
            className="w-full rounded-xl py-6 text-base font-medium"
            size="lg"
          >
            Terminar Antes
          </Button>
        )}
      </div>

      {/* Confirm Early Finish Dialog */}
      <Dialog open={isConfirmFinishOpen} onOpenChange={setIsConfirmFinishOpen}>
        <DialogContent className="sm:max-w-sm w-[85vw] rounded-xl z-60">
          <DialogHeader>
            <DialogTitle>Terminar entrenamiento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Aún quedan ejercicios o series sin completar. ¿Seguro que quieres finalizar el entrenamiento ahora?
          </p>
          <DialogFooter className="flex gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setIsConfirmFinishOpen(false)}
              disabled={isFinishing}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setIsConfirmFinishOpen(false);
                await handleFinish();
              }}
              disabled={isFinishing}
              className="flex-1"
            >
              {isFinishing ? "Guardando..." : "Sí, terminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Exit Dialog — gives the user the choice to save or leave for later */}
      <Dialog open={isExitConfirmOpen} onOpenChange={setIsExitConfirmOpen}>
        <DialogContent className="sm:max-w-sm w-[85vw] rounded-xl z-60">
          <DialogHeader>
            <DialogTitle>Salir del entrenamiento</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Quieres finalizar y guardar este entrenamiento, o salir y retomarlo más tarde?
          </p>
          <DialogFooter className="flex-col gap-2 mt-2">
            <Button
              onClick={() => handleExitRequest(true)}
              disabled={isFinishing}
              className="w-full"
            >
              {isFinishing ? "Guardando..." : "Finalizar y guardar"}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExitRequest(false)}
              disabled={isFinishing}
              className="w-full"
            >
              Salir (puedo retomarlo después)
            </Button>
            <Button
              variant="ghost"
              onClick={() => setIsExitConfirmOpen(false)}
              disabled={isFinishing}
              className="w-full"
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Swap Exercise Dialog */}
      <Dialog open={isSwapOpen} onOpenChange={setIsSwapOpen}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-xl z-60">
          <DialogHeader>
            <DialogTitle>Sustituir Ejercicio</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <datalist id="swap-exercise-suggestions">
              {exerciseLogs.map((ex) => (
                <option key={ex.exerciseId} value={ex.exerciseName} />
              ))}
            </datalist>
            <div className="flex flex-col gap-2">
              <label htmlFor="swap-ex-name" className="text-sm font-medium">Nuevo Ejercicio</label>
              <Input
                id="swap-ex-name"
                placeholder="Ej. Press inclinado"
                value={newExName}
                onChange={(e) => setNewExName(e.target.value)}
                list="swap-exercise-suggestions"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="swap-ex-muscle" className="text-sm font-medium">Grupo Muscular</label>
              <Select value={newExMuscle} onValueChange={setNewExMuscle}>
                <SelectTrigger id="swap-ex-muscle">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent className="z-70">
                  <SelectItem value="Pecho">Pecho</SelectItem>
                  <SelectItem value="Espalda">Espalda</SelectItem>
                  <SelectItem value="Hombros">Hombros</SelectItem>
                  <SelectItem value="Biceps">Biceps</SelectItem>
                  <SelectItem value="Triceps">Triceps</SelectItem>
                  <SelectItem value="Piernas">Piernas</SelectItem>
                  <SelectItem value="Gluteos">Gluteos</SelectItem>
                  <SelectItem value="Abdominales">Abdominales</SelectItem>
                  <SelectItem value="Trapecio">Trapecio</SelectItem>
                  <SelectItem value="Antebrazos">Antebrazos</SelectItem>
                  <SelectItem value="Pantorrillas">Pantorrillas</SelectItem>
                  <SelectItem value="Full Body">Full Body</SelectItem>
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
        <DialogContent className="sm:max-w-md w-[90vw] rounded-xl z-60">
          <DialogHeader>
            <DialogTitle>Guardar Peso Base</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="manual-weight" className="text-sm font-medium">
                Peso base para esta rutina
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="manual-weight"
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
                  <SelectContent className="z-70">
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                    <SelectItem value="otro">otro</SelectItem>
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
    </div>
  );
}
