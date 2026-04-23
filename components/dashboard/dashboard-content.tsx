"use client";

import { useState, useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayRoutine, estimateRoutineDuration, type Routine } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  Dumbbell,
  Flame,
  Clock,
  ChevronRight,
  Trophy,
  Scale,
  TrendingUp,
  TrendingDown,
  Target,
  Plus,
  Play,
  AlertTriangle,
  Trash2,
  Timer,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
import { startOfWeek, endOfWeek, isWithinInterval, format, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { MuscleActivity } from "./muscle-activity";
import { calcStreak } from "@/lib/streak";
import { formatTime } from "@/lib/utils";

interface ActiveSession {
  routineId: number;
  routineName: string;
  elapsed: number;
  completedSets: number;
  totalSets: number;
}

export function DashboardContent() {
  const todayRoutine = useLiveQuery(() => getTodayRoutine());
  // Filter completed in JS — the indexed query `.where("completed").equals(1)`
  // is unreliable because completed is stored as boolean, and IndexedDB key
  // comparison treats `true` and `1` as distinct values.
  const workoutLogs = useLiveQuery(async () => {
    const all = await db.workoutLogs.toArray();
    return all
      .filter((l) => Boolean(l.completed))
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
  });
  const routines = useLiveQuery(() => db.routines.toArray());
  const personalRecords = useLiveQuery(() => db.personalRecords.toArray());

  // Active workout sessions stored in localStorage
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);

  const refreshActiveSessions = () => {
    if (typeof window === "undefined") return;
    const found: ActiveSession[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("workout_active_")) {
        try {
          const session = JSON.parse(localStorage.getItem(key)!);
          const routine = routines?.find((r) => r.id === session.routineId);
          found.push({
            routineId: session.routineId,
            routineName: routine?.name ?? "Entrenamiento",
            elapsed: session.elapsed ?? 0,
            completedSets:
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              session.exerciseLogs?.reduce((acc: number, ex: any) =>
                acc + ex.sets.filter((s: any) => s.completed).length, 0) ?? 0,
            totalSets:
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              session.exerciseLogs?.reduce((acc: number, ex: any) =>
                acc + ex.sets.length, 0) ?? 0,
          });
        } catch {
          // malformed session — ignore
        }
      }
    }
    setActiveSessions(found);
  };

  // Refrescar al montar y cada vez que routines cambie o el usuario vuelve a la pestaña
  useEffect(() => {
    refreshActiveSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routines]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) refreshActiveSessions();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routines]);

  function discardSession(routineId: number) {
    localStorage.removeItem(`workout_active_${routineId}`);
    setActiveSessions((prev) => prev.filter((s) => s.routineId !== routineId));
  }

  // Body weight data
  const weightLogs = useLiveQuery(() =>
    db.bodyWeight.orderBy("date").reverse().toArray(),
  );
  const weightGoal = useLiveQuery(() =>
    db.weightGoals.orderBy("createdAt").reverse().first(),
  );

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const weekLogs =
    workoutLogs?.filter((l) => {
      const d = new Date(l.date);
      return !isNaN(d.getTime()) && isWithinInterval(d, { start: weekStart, end: weekEnd });
    }) ?? [];

  const weeklyDuration = weekLogs.reduce((s, l) => s + l.duration, 0);

  // Last week comparison
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const lastWeekLogs =
    workoutLogs?.filter((l) => {
      const d = new Date(l.date);
      return !isNaN(d.getTime()) && isWithinInterval(d, { start: lastWeekStart, end: lastWeekEnd });
    }) ?? [];
  const lastWeekDuration = lastWeekLogs.reduce((s, l) => s + l.duration, 0);

  // Consistency: workouts this week / UNIQUE days of the week with a routine.
  // Deduplicating by dayOfWeek so users with two routines scheduled the same
  // day don't inflate the denominator. Also caps at 7 (Mon–Sun).
  const uniqueTrainingDays = useMemo(() => {
    const s = new Set<number>();
    (routines ?? []).forEach((r) => {
      if (r.dayOfWeek !== null && r.dayOfWeek !== undefined) s.add(r.dayOfWeek);
    });
    return s.size;
  }, [routines]);

  const consistency =
    uniqueTrainingDays > 0
      ? Math.min(100, Math.round((weekLogs.length / uniqueTrainingDays) * 100))
      : 0;

  const dayName = format(now, "EEEE", { locale: es });

  // Racha de entrenamiento — respeta días de descanso (solo se rompe si faltas
  // a un día DE RUTINA asignado, no por fines de semana libres).
  const streak = useMemo(
    () => calcStreak(workoutLogs ?? [], routines ?? []),
    [workoutLogs, routines],
  );

  // ¿La rutina de hoy ya fue completada?
  const todayStr = now.toDateString();
  const todayCompleted = useMemo(
    () =>
      !!todayRoutine &&
      (workoutLogs?.some(
        (l) =>
          new Date(l.date).toDateString() === todayStr &&
          l.routineId === todayRoutine?.id,
      ) ?? false),
    [workoutLogs, todayRoutine, todayStr],
  );

  // Body weight calculations
  const latestWeight = weightLogs?.[0]?.weight;
  const firstWeight = weightLogs?.[weightLogs.length - 1]?.weight;
  const weightChange =
    latestWeight && firstWeight ? latestWeight - firstWeight : 0;

  // Goal progress — con guard contra división por cero y resultado NaN/Infinity
  const goalProgress = (() => {
    if (!weightGoal || !latestWeight) return null;
    const { targetWeight, startWeight } = weightGoal;
    const range = targetWeight - startWeight;
    if (range === 0) return 100; // ya en el objetivo
    const raw =
      range > 0
        ? ((latestWeight - startWeight) / range) * 100
        : ((startWeight - latestWeight) / -range) * 100;
    if (!isFinite(raw) || isNaN(raw)) return 0;
    return Math.min(100, Math.max(0, raw));
  })();

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground capitalize">
          {dayName}, {format(now, "d MMM yyyy", { locale: es })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          Cuti Traning
        </h1>
      </div>

      {/* Streak banner */}
      {streak > 0 && (
        <div className="mb-5 flex items-center gap-4 rounded-2xl bg-orange-500/10 border border-orange-500/20 px-4 py-3">
          <span className="text-4xl leading-none select-none">🔥</span>
          <div>
            <p className="text-xl font-bold text-foreground leading-tight">
              {streak} {streak === 1 ? "día" : "días"} de racha
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {streak >= 7
                ? "¡Semana perfecta! Sigue así"
                : streak >= 3
                  ? "¡No rompas la cadena!"
                  : "¡Buen comienzo, mantén el ritmo!"}
            </p>
          </div>
        </div>
      )}

      {/* Active workout sessions banner */}
      {activeSessions.map((session) => (
        <Card
          key={session.routineId}
          className="mb-4 border-amber-500/50 bg-amber-500/10"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                    Entrenamiento en curso
                  </p>
                  <p className="font-semibold text-foreground truncate">
                    {session.routineName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.completedSets}/{session.totalSets} series •{" "}
                    {formatTime(session.elapsed)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/workout/${session.routineId}`}>
                  <Button size="sm" className="gap-1 h-8">
                    <Play className="h-3 w-3" />
                    Retomar
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => discardSession(session.routineId)}
                  title="Descartar sesión"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Today's Routine CTA */}
      <Card className="mb-5 border-primary/20 bg-linear-to-br from-primary/10 to-primary/5">
        <CardContent className="p-5">
          {todayRoutine ? (
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">
                    Rutina de hoy
                  </p>
                  {todayCompleted && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/15 border border-green-500/20 rounded-full px-2 py-0.5">
                      <CheckCircle2 className="h-3 w-3" />
                      Completada
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xl font-bold text-foreground">
                  {todayRoutine.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {todayRoutine.exercises.length} ejercicios •{" "}
                  ~{Math.round(estimateRoutineDuration(todayRoutine) / 60)} min
                </p>
              </div>
              <Link href={`/workout/${todayRoutine.id}`}>
                <Button
                  size="lg"
                  variant={todayCompleted ? "outline" : "default"}
                  className="gap-2 rounded-xl font-semibold h-12 px-6"
                >
                  <Dumbbell className="h-5 w-5" />
                  {todayCompleted ? "Repetir" : "Comenzar"}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base text-muted-foreground">
                  No tienes rutina asignada para hoy
                </p>
              </div>
              <Link href="/routines">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-lg"
                >
                  Ver rutinas
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid - 2 columnas */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card className="bg-chart-2/10 border-chart-2/20">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-1">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-chart-2" />
              <span className="text-xs font-bold text-chart-2 uppercase tracking-wide">
                Tiempo
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {weeklyDuration > 3600
                ? `${(weeklyDuration / 3600).toFixed(1)}h`
                : `${Math.round(weeklyDuration / 60)}m`}
            </p>
            <p className="text-xs text-muted-foreground">esta semana</p>
          </CardContent>
        </Card>

        <Card className="bg-chart-3/10 border-chart-3/20">
          <CardContent className="p-5 flex flex-col items-center justify-center text-center gap-1">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-5 w-5 text-chart-3" />
              <span className="text-xs font-bold text-chart-3 uppercase tracking-wide">
                Consistencia
              </span>
            </div>
            <p className="text-3xl font-bold text-foreground">{consistency}%</p>
            <Progress value={consistency} className="h-2 w-full mt-1" />
          </CardContent>
        </Card>
      </div>

      {/* Weekly comparison */}
      {(weekLogs.length > 0 || lastWeekLogs.length > 0) && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Esta semana vs semana anterior
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Workouts */}
              {(() => {
                const diff = weekLogs.length - lastWeekLogs.length;
                return (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Sesiones</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-foreground">{weekLogs.length}</span>
                      {lastWeekLogs.length > 0 && (
                        <span className={`flex items-center gap-0.5 text-xs font-medium mb-0.5 ${diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {diff > 0 ? <ArrowUp className="h-3 w-3" /> : diff < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">anterior: {lastWeekLogs.length}</span>
                  </div>
                );
              })()}
              {/* Duration */}
              {(() => {
                const diff = weeklyDuration - lastWeekDuration;
                const fmt = (s: number) => s > 3600 ? `${(s / 3600).toFixed(1)}h` : `${Math.round(s / 60)}m`;
                return (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Tiempo</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <span className="text-2xl font-bold text-foreground">{fmt(weeklyDuration)}</span>
                      {lastWeekDuration > 0 && (
                        <span className={`flex items-center gap-0.5 text-xs font-medium mb-0.5 ${diff > 0 ? "text-green-500" : diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                          {diff > 0 ? <ArrowUp className="h-3 w-3" /> : diff < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {diff > 60 ? `+${fmt(Math.abs(diff))}` : diff < -60 ? `-${fmt(Math.abs(diff))}` : "="}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">anterior: {fmt(lastWeekDuration)}</span>
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weight & Goal Card */}
      {latestWeight ? (
        <Card className="mb-4 bg-linear-to-br from-chart-4/10 to-chart-4/5 border-chart-4/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-chart-4" />
                <span className="text-sm font-bold text-chart-4 uppercase tracking-wide">
                  Peso Corporal
                </span>
              </div>
              <Link href="/body-weight">
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                  Ver más <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>

            {/* Current Weight */}
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-3xl font-bold text-foreground">
                  {latestWeight.toFixed(1)}
                  <span className="text-lg font-normal text-muted-foreground ml-1">
                    kg
                  </span>
                </p>
                {weightLogs && weightLogs.length > 1 && (
                  <div
                    className={`flex items-center gap-1 text-xs font-medium mt-1 ${
                      weightChange > 0
                        ? "text-chart-2"
                        : weightChange < 0
                          ? "text-chart-3"
                          : "text-muted-foreground"
                    }`}
                  >
                    {weightChange > 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : weightChange < 0 ? (
                      <TrendingDown className="h-3 w-3" />
                    ) : null}
                    <span>
                      {weightChange > 0 ? "+" : ""}
                      {weightChange.toFixed(1)} kg
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Goal Progress */}
            {weightGoal && goalProgress !== null && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-chart-3" />
                    <span className="text-sm font-medium text-chart-3">
                      Meta: {weightGoal.targetWeight} kg
                    </span>
                  </div>
                  <span className="text-sm font-bold text-chart-3">
                    {Math.min(100, Math.max(0, goalProgress)).toFixed(0)}%
                  </span>
                </div>
                <Progress
                  value={Math.min(100, Math.max(0, goalProgress))}
                  className="h-2 bg-chart-3/20"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {latestWeight > weightGoal.targetWeight
                    ? `Te faltan ${(latestWeight - weightGoal.targetWeight).toFixed(1)} kg`
                    : `Te faltan ${(weightGoal.targetWeight - latestWeight).toFixed(1)} kg`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-4 bg-linear-to-br from-chart-4/10 to-chart-4/5 border-chart-4/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-chart-4" />
                <span className="text-sm font-bold text-chart-4 uppercase tracking-wide">
                  Peso Corporal
                </span>
              </div>
              <Link href="/body-weight">
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <MuscleActivity />

      {/* PRs Section */}
      <Card className="mb-4">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Records Personales
          </CardTitle>
          <Link href="/personal-records">
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {personalRecords && personalRecords.length > 0 ? (
            <div className="space-y-2">
              {personalRecords
                .filter((pr) => pr.type === "weight")
                .sort(
                  (a, b) =>
                    new Date(b.date).getTime() - new Date(a.date).getTime(),
                )
                .slice(0, 5)
                .map((pr) => (
                  <div
                    key={pr.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10">
                        <TrendingUp className="h-4 w-4 text-yellow-500" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground text-sm">
                          {pr.exerciseName}
                        </p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-accent">
                      {pr.details}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <Trophy className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                Sin records aún. ¡Entrena para establecerlos!
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
