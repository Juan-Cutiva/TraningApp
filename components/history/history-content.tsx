"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, calculate1RM } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  TrendingUp,
  CalendarOff,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function HistoryContent() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const allLogs = useLiveQuery(() => db.workoutLogs.reverse().sortBy("date"));

  const exerciseNames = useLiveQuery(async () => {
    const logs = await db.workoutLogs.toArray();
    const names = new Set<string>();
    logs.forEach((l) => l.exercises.forEach((e) => names.add(e.exerciseName)));
    return Array.from(names).sort();
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthLogs =
    allLogs?.filter((l) => {
      const d = new Date(l.date);
      return d >= monthStart && d <= monthEnd;
    }) ?? [];

  const monthDuration = monthLogs.reduce((s, l) => s + l.duration, 0);

  const selectedDayLog = selectedDate
    ? (allLogs?.find((l) => isSameDay(new Date(l.date), selectedDate)) ?? null)
    : null;

  function handleDayClick(day: Date) {
    setSelectedDate(day);
    setSheetOpen(true);
  }

  const exerciseChartData = selectedExercise
    ? (allLogs
        ?.filter((l) =>
          l.exercises.some((e) => e.exerciseName === selectedExercise),
        )
        .reverse()
        .map((l) => {
          const ex = l.exercises.find(
            (e) => e.exerciseName === selectedExercise,
          );
          const completedSets = ex?.sets.filter((s) => s.completed) ?? [];
          const maxWeight =
            completedSets.length > 0
              ? Math.max(...completedSets.map((s) => s.weight))
              : 0;
          const bestSet =
            completedSets.length > 0
              ? completedSets.reduce(
                  (best, s) => (s.weight > best.weight ? s : best),
                  completedSets[0],
                )
              : null;
          const bestWeight = bestSet?.weight ?? 0;
          const bestReps = bestSet?.reps ?? 0;
          const rm = calculate1RM(bestWeight, bestReps);
          return {
            date: format(new Date(l.date), "dd/MM"),
            peso: maxWeight,
            "1RM": rm.epley,
          };
        }) ?? [])
    : [];

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Historial</h1>

      <Tabs defaultValue="calendar">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="calendar" className="flex-1">
            Calendario
          </TabsTrigger>
          <TabsTrigger value="exercises" className="flex-1">
            Ejercicios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="font-semibold text-foreground capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: es })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-4">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-muted-foreground py-1"
              >
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const hasWorkout = allLogs?.some((l) =>
                isSameDay(new Date(l.date), day),
              );
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={i}
                  onClick={() => handleDayClick(day)}
                  className={`relative flex h-10 items-center justify-center rounded-lg text-sm transition-colors
                    ${!isCurrentMonth ? "text-muted-foreground/30" : "text-foreground"}
                    ${isToday && !isSelected ? "bg-primary/15 font-bold text-primary" : ""}
                    ${isSelected ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${isCurrentMonth && !isSelected ? "hover:bg-muted active:bg-muted/70" : ""}
                  `}
                >
                  {format(day, "d")}
                  {hasWorkout && isCurrentMonth && !isSelected && (
                    <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                  {hasWorkout && isCurrentMonth && isSelected && (
                    <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Stats - 2 columnas más grandes y atractivas */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-2 mb-1">
                  <Dumbbell className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    Entrenamientos
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {monthLogs.length}
                </p>
                <p className="text-xs text-muted-foreground">este mes</p>
              </CardContent>
            </Card>
            <Card className="bg-chart-3/10 border-chart-3/20">
              <CardContent className="p-5 flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-5 w-5 text-chart-3" />
                  <span className="text-xs font-medium text-chart-3 uppercase tracking-wide">
                    Tiempo total
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {Math.round(monthDuration / 60)}m
                </p>
                <p className="text-xs text-muted-foreground">minutos</p>
              </CardContent>
            </Card>
          </div>

          <h2 className="mb-3 text-base font-semibold text-foreground">
            Sesiones recientes
          </h2>
          {!allLogs || allLogs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <CalendarOff className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium text-foreground">
                  Sin entrenamientos aún
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Completa tu primera rutina para ver el historial aquí
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {allLogs?.slice(0, 10).map((log) => (
                <Card
                  key={log.id}
                  className="cursor-pointer hover:bg-muted/50 transition-all active:scale-[0.99] border-border/60"
                  onClick={() => {
                    setSelectedDate(new Date(log.date));
                    setSheetOpen(true);
                  }}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                        <Dumbbell className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {log.routineName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(log.date), "EEEE dd MMM", {
                            locale: es,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-foreground">
                        {Math.round(log.duration / 60)}m
                      </p>
                      <p className="text-xs text-muted-foreground">duración</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="exercises">
          <div className="mb-5">
            <Select
              value={selectedExercise ?? ""}
              onValueChange={(v) => setSelectedExercise(v || null)}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Selecciona un ejercicio para ver su progreso" />
              </SelectTrigger>
              <SelectContent>
                {exerciseNames?.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedExercise && exerciseChartData.length > 0 && (
            <>
              <Card className="mb-4">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base font-semibold">
                    Progreso: {selectedExercise}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={exerciseChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "12px",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="peso"
                        stroke="var(--color-primary)"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "var(--color-primary)" }}
                        name="Peso Max"
                      />
                      <Line
                        type="monotone"
                        dataKey="1RM"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: "var(--color-accent)" }}
                        name="1RM Est."
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <ExercisePRs exerciseName={selectedExercise} />
            </>
          )}

          {selectedExercise && exerciseChartData.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <TrendingUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium text-foreground">
                  Sin datos aún
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Completa este ejercicio en tus entrenamientos
                </p>
              </CardContent>
            </Card>
          )}

          {!selectedExercise && (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <p className="text-lg font-medium text-foreground">
                  Selecciona un ejercicio
                </p>
                <p className="text-sm text-muted-foreground mt-2 max-w-[250px]">
                  Elige un ejercicio para ver tu historial de peso y progreso
                  estimado de 1RM
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75dvh] overflow-auto rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-lg">
              {selectedDate
                ? format(selectedDate, "EEEE dd 'de' MMMM yyyy", {
                    locale: es,
                  })
                : ""}
            </SheetTitle>
          </SheetHeader>

          <div className="px-4 pb-8">
            {selectedDayLog ? (
              <div>
                <div className="mb-5 flex items-center gap-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15">
                    <Dumbbell className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-foreground">
                      {selectedDayLog.routineName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedDayLog.exercises.length} ejercicios •{" "}
                      {Math.round(selectedDayLog.duration / 60)} minutos
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {selectedDayLog.exercises.map((ex, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border p-4 bg-card"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground">
                            {ex.exerciseName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {ex.muscleGroup}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                          {ex.sets.filter((s) => s.completed).length} series
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {ex.sets
                          .filter((s) => s.completed)
                          .map((s, si) => (
                            <span
                              key={si}
                              className="inline-flex items-center text-sm bg-secondary/70 px-3 py-1.5 rounded-lg text-foreground font-medium"
                            >
                              {s.weight}
                              {s.unit} × {s.reps}
                            </span>
                          ))}
                        {ex.sets.filter((s) => s.completed).length === 0 && (
                          <span className="text-sm text-muted-foreground">
                            Sin series completadas
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <CalendarOff className="mb-4 h-14 w-14 text-muted-foreground/30" />
                <p className="text-lg font-medium text-foreground">
                  Día de descanso
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  No hubo entrenamiento este día
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ExercisePRs({ exerciseName }: { exerciseName: string }) {
  const prs = useLiveQuery(
    () =>
      db.personalRecords.where("exerciseName").equals(exerciseName).toArray(),
    [exerciseName],
  );

  if (!prs || prs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold">
          Records Personales
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {prs.map((pr) => (
          <div
            key={pr.id}
            className="flex items-center justify-between py-3 border-b border-border last:border-0"
          >
            <div>
              <p className="font-medium text-foreground">
                {pr.type === "weight" ? "🏆 Mayor Peso" : "🔥 Mayor Reps"}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(pr.date), "dd MMM yyyy", { locale: es })}
              </p>
            </div>
            <span className="text-lg font-bold text-accent">{pr.details}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
