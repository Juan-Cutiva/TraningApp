"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayRoutine } from "@/lib/db";
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
} from "lucide-react";
import { startOfWeek, endOfWeek, isWithinInterval, format } from "date-fns";
import { es } from "date-fns/locale";
import { MuscleActivity } from "./muscle-activity";

export function DashboardContent() {
  const todayRoutine = useLiveQuery(() => getTodayRoutine());
  const workoutLogs = useLiveQuery(() =>
    db.workoutLogs.where("completed").equals(1).reverse().sortBy("date"),
  );
  const routines = useLiveQuery(() => db.routines.toArray());
  const personalRecords = useLiveQuery(() => db.personalRecords.toArray());

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

  // Consistency: workouts this week / routines assigned to days
  const assignedDays =
    routines?.filter((r) => r.dayOfWeek !== null).length ?? 0;
  const consistency =
    assignedDays > 0
      ? Math.min(100, Math.round((weekLogs.length / assignedDays) * 100))
      : 0;

  const dayName = format(now, "EEEE", { locale: es });

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

      {/* Today's Routine CTA */}
      <Card className="mb-5 border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="p-5">
          {todayRoutine ? (
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-bold text-primary uppercase tracking-wider">
                  Rutina de hoy
                </p>
                <p className="mt-1.5 text-xl font-bold text-foreground">
                  {todayRoutine.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {todayRoutine.exercises.length} ejercicios
                </p>
              </div>
              <Link href={`/workout/${todayRoutine.id}`}>
                <Button
                  size="lg"
                  className="gap-2 rounded-xl font-semibold h-12 px-6"
                >
                  <Dumbbell className="h-5 w-5" />
                  Comenzar
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

      {/* Weight & Goal Card */}
      {latestWeight ? (
        <Card className="mb-4 bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/30">
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
        <Card className="mb-4 bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/30">
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
