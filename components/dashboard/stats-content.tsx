"use client";

import { useState, useMemo } from "react";
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
  PieChart,
  Pie,
  Cell,
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
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  totalDuration: number;
  averageDuration: number;
  currentStreak: number;
  longestStreak: number;
  thisWeekWorkouts: number;
  thisMonthWorkouts: number;
  durationByWorkout: { date: string; duration: number }[];
  progressByExercise: ProgressData[];
  muscleDistribution: { name: string; value: number }[];
  baseWeightForExercise: number;
}

const defaultStats: Stats = {
  totalWorkouts: 0,
  totalDuration: 0,
  averageDuration: 0,
  currentStreak: 0,
  longestStreak: 0,
  thisWeekWorkouts: 0,
  thisMonthWorkouts: 0,
  durationByWorkout: [],
  progressByExercise: [],
  muscleDistribution: [],
  baseWeightForExercise: 0,
};

export function StatsContent() {
  const workoutLogs = useLiveQuery(() => db.workoutLogs.toArray());
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
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const thisWeekWorkouts = workoutLogs.filter((log) => {
      const logDate = new Date(log.date);
      return logDate >= weekStart && logDate <= weekEnd && log.completed;
    }).length;

    const thisMonthWorkouts = workoutLogs.filter((log) => {
      const logDate = new Date(log.date);
      return logDate >= monthStart && logDate <= monthEnd && log.completed;
    }).length;

    const totalDuration = workoutLogs.reduce(
      (sum, log) => sum + log.duration,
      0,
    );

    const averageDuration = totalDuration / workoutLogs.length;

    // Obtener días únicos con entrenamiento
    const uniqueDaysSet = new Set<string>();
    workoutLogs
      .filter((l) => l.completed)
      .forEach((log) => {
        const dayKey = format(new Date(log.date), "yyyy-MM-dd");
        uniqueDaysSet.add(dayKey);
      });

    const uniqueDays = Array.from(uniqueDaysSet).sort((a, b) =>
      b.localeCompare(a),
    );

    // Logs ordenados para duración
    const sortedLogs = [...workoutLogs]
      .filter((l) => l.completed)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calcular racha actual - solo cuenta días únicos
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mostRecentDay = uniqueDays[0] ? new Date(uniqueDays[0]) : null;
    if (mostRecentDay) {
      mostRecentDay.setHours(0, 0, 0, 0);
      const diffFromToday = Math.floor(
        (today.getTime() - mostRecentDay.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Solo cuenta si entrenó hoy (0) o ayer (1)
      if (diffFromToday <= 1) {
        let checkDate = mostRecentDay;
        for (const dayStr of uniqueDays) {
          const checkDay = new Date(dayStr);
          checkDay.setHours(0, 0, 0, 0);
          const diff = Math.floor(
            (checkDate.getTime() - checkDay.getTime()) / (1000 * 60 * 60 * 24),
          );
          if (diff === 0) {
            currentStreak++;
          } else if (diff === 1) {
            currentStreak++;
            checkDate = checkDay;
          } else {
            break;
          }
        }
      }
    }

    // Calcular racha más larga
    let longestStreak = 0;
    let tempStreak = 0;
    let prevDate: Date | null = null;
    const sortedUniqueDays = [...uniqueDays].sort((a, b) => a.localeCompare(b));

    for (const dayStr of sortedUniqueDays) {
      const currentDate = new Date(dayStr);
      currentDate.setHours(0, 0, 0, 0);
      if (prevDate === null) {
        tempStreak = 1;
      } else {
        const diff = Math.floor(
          (currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diff === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
      }
      prevDate = currentDate;
    }

    if (longestStreak < currentStreak) {
      longestStreak = currentStreak;
    }

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

    const muscleCounts: Record<string, number> = {};
    workoutLogs.forEach((log) => {
      log.exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed).length;
        if (completedSets > 0) {
          muscleCounts[ex.muscleGroup] =
            (muscleCounts[ex.muscleGroup] || 0) + completedSets;
        }
      });
    });

    const muscleDistribution = Object.entries(muscleCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalWorkouts: workoutLogs.filter((l) => l.completed).length,
      totalDuration,
      averageDuration,
      currentStreak,
      longestStreak,
      thisWeekWorkouts,
      thisMonthWorkouts,
      durationByWorkout,
      progressByExercise,
      muscleDistribution,
      baseWeightForExercise,
    };
  }, [workoutLogs, selectedExercise]);

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
                    Tiempo Total
                  </span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatDuration(stats.totalDuration)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ~{formatDuration(stats.averageDuration)} promedio
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
          {stats.muscleDistribution.length > 0 ? (
            <>
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">
                    Distribución de Series
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={stats.muscleDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {stats.muscleDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          `${value} series`,
                          name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm">
                    Top Grupos Musculares
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-3">
                    {stats.muscleDistribution
                      .slice(0, 7)
                      .map((muscle, index) => {
                        const maxValue =
                          stats.muscleDistribution[0]?.value || 1;
                        const percentage = (muscle.value / maxValue) * 100;

                        return (
                          <div key={muscle.name}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium text-foreground">
                                {muscle.name}
                              </span>
                              <span className="text-muted-foreground">
                                {muscle.value} series
                              </span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor:
                                    COLORS[index % COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Sin datos aún</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
