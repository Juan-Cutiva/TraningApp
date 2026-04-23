"use client";

import { useState, useMemo } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Target, Dumbbell, Flame } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  isWithinInterval,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { calcStreak, calcLongestStreak } from "@/lib/streak";

const COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
];

interface ProgressData {
  date: string;
  weight: number;
  reps: number;
  baseWeight: number;
}

interface Stats {
  totalWorkouts: number;
  thisWeekDuration: number;
  averageDuration: number;
  currentStreak: number;
  longestStreak: number;
  thisWeekWorkouts: number;
  thisMonthWorkouts: number;
  durationByWorkout: { date: string; duration: number }[];
  progressByExercise: ProgressData[];
  /** Sets actually completed this week, by muscle. Resets Sunday 23:59 local. */
  muscleActualWeek: { name: string; value: number }[];
  /** Sets prescribed per week according to assigned routines, by muscle. */
  musclePlannedWeek: { name: string; value: number }[];
  baseWeightForExercise: number;
}

const defaultStats: Stats = {
  totalWorkouts: 0,
  thisWeekDuration: 0,
  averageDuration: 0,
  currentStreak: 0,
  longestStreak: 0,
  thisWeekWorkouts: 0,
  thisMonthWorkouts: 0,
  durationByWorkout: [],
  progressByExercise: [],
  muscleActualWeek: [],
  musclePlannedWeek: [],
  baseWeightForExercise: 0,
};

export function StatsContent() {
  const workoutLogs = useLiveQuery(() => db.workoutLogs.toArray());
  const routines = useLiveQuery(() => db.routines.toArray());
  const [selectedExercise, setSelectedExercise] = useState<string>("all");

  const exerciseList = useMemo(() => {
    if (!workoutLogs) return [];
    const exercises = new Set<string>();
    workoutLogs.forEach((log) => {
      log.exercises.forEach((ex) => {
        exercises.add(ex.exerciseName);
      });
    });
    return Array.from(exercises).sort();
  }, [workoutLogs]);

  const stats: Stats = useMemo(() => {
    if (!workoutLogs || workoutLogs.length === 0) {
      return { ...defaultStats };
    }

    const now = new Date();
    // weekStartsOn: 1 → Monday; endOfWeek returns Sunday 23:59:59.999 local.
    // This satisfies the "weekly reset on Sunday 23:59 in user's timezone" rule
    // automatically since all dates are evaluated in local time.
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const thisWeekLogs = workoutLogs.filter((log) => {
      const d = new Date(log.date);
      return (
        !isNaN(d.getTime()) &&
        log.completed &&
        isWithinInterval(d, { start: weekStart, end: weekEnd })
      );
    });
    const thisWeekWorkouts = thisWeekLogs.length;
    const thisWeekDuration = thisWeekLogs.reduce((s, l) => s + l.duration, 0);

    const thisMonthWorkouts = workoutLogs.filter((log) => {
      const logDate = new Date(log.date);
      return logDate >= monthStart && logDate <= monthEnd && log.completed;
    }).length;

    const completedLogs = workoutLogs.filter((l) => l.completed);
    const totalDuration = completedLogs.reduce((sum, l) => sum + l.duration, 0);
    const averageDuration =
      completedLogs.length > 0 ? totalDuration / completedLogs.length : 0;

    // Streak — uses the shared helper that respects assigned training days
    const currentStreak = calcStreak(workoutLogs, routines ?? [], now);
    const longestStreak = calcLongestStreak(workoutLogs, routines ?? []);

    // Logs ordenados para duración (últimos 10, cronológicos)
    const sortedLogs = [...completedLogs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const durationByWorkout = sortedLogs
      .slice(0, 10)
      .reverse()
      .map((log) => ({
        date: format(new Date(log.date), "d MMM", { locale: es }),
        duration: Math.round(log.duration / 60),
      }));

    const progressByExercise: ProgressData[] = [];
    let baseWeightForExercise = 0;

    if (selectedExercise && selectedExercise !== "all") {
      const weightCounts: Record<number, number> = {};
      const tempData: { date: string; weight: number; reps: number }[] = [];

      const filteredLogs = workoutLogs
        .filter((log) => log.completed)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );

      filteredLogs.forEach((log) => {
        const exercise = log.exercises.find(
          (ex) => ex.exerciseName === selectedExercise,
        );
        if (exercise && exercise.sets.some((s) => s.completed)) {
          const completedSets = exercise.sets.filter((s) => s.completed);
          const maxWeight = Math.max(
            ...completedSets.map((s) =>
              typeof s.weight === "string"
                ? parseFloat(s.weight) || 0
                : s.weight,
            ),
          );
          const maxReps = Math.max(
            ...completedSets.map((s) =>
              typeof s.reps === "string"
                ? parseInt(s.reps as string, 10) || 0
                : s.reps,
            ),
          );

          completedSets.forEach((s) => {
            const w =
              typeof s.weight === "string"
                ? parseFloat(s.weight) || 0
                : s.weight;
            if (w > 0) {
              weightCounts[w] = (weightCounts[w] || 0) + 1;
            }
          });

          tempData.push({
            date: format(new Date(log.date), "d MMM", { locale: es }),
            weight: maxWeight,
            reps: maxReps,
          });
        }
      });

      if (Object.keys(weightCounts).length > 0) {
        const mostUsed = Object.entries(weightCounts).sort(
          (a, b) => b[1] - a[1],
        )[0];
        baseWeightForExercise = parseFloat(mostUsed[0]);
      }

      progressByExercise.push(
        ...tempData.map((d) => ({
          ...d,
          baseWeight: baseWeightForExercise,
        })),
      );
    }

    // Muscle distribution — actually trained THIS WEEK (Mon–Sun local)
    const muscleActualCounts: Record<string, number> = {};
    thisWeekLogs.forEach((log) => {
      log.exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed).length;
        if (completedSets > 0) {
          const group = ex.muscleGroup || "Otros";
          muscleActualCounts[group] = (muscleActualCounts[group] || 0) + completedSets;
        }
      });
    });
    const muscleActualWeek = Object.entries(muscleActualCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Muscle distribution — PLANNED per week according to saved routines.
    // Incluye TODAS las rutinas con ejercicios, incluso las que no tienen
    // dayOfWeek asignado (el planificador debe aparecer apenas haya al menos
    // una rutina establecida). Las que sí tienen dayOfWeek se deduplican por
    // día para no sumar dos rutinas del mismo día.
    const planned: Record<string, number> = {};
    const seenDays = new Set<number>();
    (routines ?? []).forEach((r) => {
      if (r.dayOfWeek !== null && r.dayOfWeek !== undefined) {
        if (seenDays.has(r.dayOfWeek)) return;
        seenDays.add(r.dayOfWeek);
      }
      r.exercises.forEach((ex) => {
        const group = ex.muscleGroup || "Otros";
        planned[group] = (planned[group] || 0) + (ex.sets || 0);
      });
    });
    const musclePlannedWeek = Object.entries(planned)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalWorkouts: completedLogs.length,
      thisWeekDuration,
      averageDuration,
      currentStreak,
      longestStreak,
      thisWeekWorkouts,
      thisMonthWorkouts,
      durationByWorkout,
      progressByExercise,
      muscleActualWeek,
      musclePlannedWeek,
      baseWeightForExercise,
    };
  }, [workoutLogs, routines, selectedExercise]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p
              key={index}
              className="text-sm font-bold"
              style={{ color: entry.color }}
            >
              {entry.name}: {entry.value}{" "}
              {entry.name === "duration" ? "min" : "kg"}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Estadísticas</h1>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="general" className="flex-1">
            General
          </TabsTrigger>
          <TabsTrigger value="progreso" className="flex-1">
            Progreso
          </TabsTrigger>
          <TabsTrigger value="musculos" className="flex-1">
            Músculos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Entrenamientos
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {stats.totalWorkouts}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.thisMonthWorkouts} este mes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="h-4 w-4 text-chart-2" />
                  <span className="text-xs text-muted-foreground">
                    Tiempo esta semana
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatDuration(stats.thisWeekDuration)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ~{formatDuration(stats.averageDuration)} por sesión
                </p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-chart-4" />
                  <span className="text-xs text-muted-foreground">
                    Racha Actual
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {stats.currentStreak} días
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.longestStreak} máximo histórico
                </p>
              </CardContent>
            </Card>
          </div>

          {stats.durationByWorkout.length > 0 && (
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">
                  Duración por Entrenamiento
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <ErrorBoundary>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.durationByWorkout}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                      unit="m"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="duration"
                      name="duration"
                      fill="#4361ee"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
                </ErrorBoundary>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="progreso" className="space-y-4">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Seleccionar Ejercicio</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Select
                value={selectedExercise}
                onValueChange={setSelectedExercise}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un ejercicio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ejercicios</SelectItem>
                  {exerciseList.map((ex) => (
                    <SelectItem key={ex} value={ex}>
                      {ex}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedExercise !== "all" &&
            stats.progressByExercise.length > 1 && (
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">
                    Peso - {selectedExercise}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ErrorBoundary>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={stats.progressByExercise}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        className="fill-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        className="fill-muted-foreground"
                        unit="kg"
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        name="Peso máximo"
                        stroke="#4361ee"
                        strokeWidth={2}
                        dot={{ fill: "#4361ee", r: 4 }}
                      />
                      {stats.baseWeightForExercise > 0 && (
                        <Line
                          type="monotone"
                          dataKey="baseWeight"
                          name="Peso base"
                          stroke="#f472b6"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          dot={{ fill: "#f472b6", r: 3 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                  </ErrorBoundary>
                </CardContent>
              </Card>
            )}

          {selectedExercise === "all" && (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">
                  Selecciona un ejercicio para ver su progreso
                </p>
              </CardContent>
            </Card>
          )}

          {selectedExercise !== "all" &&
            stats.progressByExercise.length <= 1 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">
                    Necesitas más datos de este ejercicio
                  </p>
                </CardContent>
              </Card>
            )}
        </TabsContent>

        <TabsContent value="musculos" className="space-y-4">
          {stats.musclePlannedWeek.length === 0 && stats.muscleActualWeek.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Sin datos aún</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crea rutinas y entrena para ver la distribución muscular.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Planificado por rutina — se muestra apenas haya al menos
                  una rutina con ejercicios, con o sin día asignado. */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">
                    Planificado por semana
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Series prescritas en tus rutinas. Rutinas con el mismo día
                    cuentan una vez por semana.
                  </p>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {stats.musclePlannedWeek.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Crea al menos una rutina para ver este gráfico.
                    </p>
                  ) : (
                    <div className="space-y-3 mt-2">
                      {stats.musclePlannedWeek.map((muscle, index) => {
                        const maxValue = stats.musclePlannedWeek[0]?.value || 1;
                        const percentage = (muscle.value / maxValue) * 100;
                        return (
                          <div key={muscle.name}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium text-foreground">{muscle.name}</span>
                              <span className="text-muted-foreground">{muscle.value} series</span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: COLORS[index % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trabajado realmente esta semana */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">
                    Trabajado esta semana
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Series completadas de lunes a domingo. Se reinicia el domingo 23:59.
                  </p>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {stats.muscleActualWeek.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Aún no has entrenado esta semana.
                    </p>
                  ) : (
                    <div className="space-y-3 mt-2">
                      {stats.muscleActualWeek.map((muscle, index) => {
                        const maxValue = stats.muscleActualWeek[0]?.value || 1;
                        const percentage = (muscle.value / maxValue) * 100;
                        // Show planned target (if we have one) as a faint marker
                        const planned = stats.musclePlannedWeek.find((m) => m.name === muscle.name)?.value;
                        const reachedPct =
                          planned && planned > 0
                            ? Math.min(100, Math.round((muscle.value / planned) * 100))
                            : null;
                        return (
                          <div key={muscle.name}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium text-foreground">{muscle.name}</span>
                              <span className="text-muted-foreground">
                                {muscle.value} series
                                {reachedPct !== null && (
                                  <span className="ml-1 text-[10px] opacity-70">
                                    ({reachedPct}% del plan)
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: COLORS[index % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
