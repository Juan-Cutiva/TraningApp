"use client"

import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db, calculate1RM, type WorkoutLog } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
} from "date-fns"
import { es } from "date-fns/locale"
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  TrendingUp,
  CalendarOff,
  X,
} from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

export function HistoryContent() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)

  const allLogs = useLiveQuery(() =>
    db.workoutLogs.reverse().sortBy("date")
  )

  const exerciseNames = useLiveQuery(async () => {
    const logs = await db.workoutLogs.toArray()
    const names = new Set<string>()
    logs.forEach((l) => l.exercises.forEach((e) => names.add(e.exerciseName)))
    return Array.from(names).sort()
  })

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const calendarDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const monthLogs =
    allLogs?.filter((l) => {
      const d = new Date(l.date)
      return d >= monthStart && d <= monthEnd
    }) ?? []

  const monthVolume = monthLogs.reduce((s, l) => s + l.totalVolume, 0)
  const monthDuration = monthLogs.reduce((s, l) => s + l.duration, 0)

  // Get log for the selected date
  const selectedDayLog = selectedDate
    ? allLogs?.find((l) => isSameDay(new Date(l.date), selectedDate)) ?? null
    : null

  function handleDayClick(day: Date) {
    setSelectedDate(day)
    setSheetOpen(true)
  }

  // Exercise progress data
  const exerciseChartData = selectedExercise
    ? allLogs
        ?.filter((l) =>
          l.exercises.some((e) => e.exerciseName === selectedExercise)
        )
        .reverse()
        .map((l) => {
          const ex = l.exercises.find(
            (e) => e.exerciseName === selectedExercise
          )
          const completedSets = ex?.sets.filter((s) => s.completed) ?? []
          const maxWeight =
            completedSets.length > 0
              ? Math.max(...completedSets.map((s) => s.weight))
              : 0
          const bestSet = completedSets.reduce(
            (best, s) => (s.weight > best.weight ? s : best),
            { weight: 0, reps: 0 }
          )
          const rm = calculate1RM(bestSet.weight, bestSet.reps)
          return {
            date: format(new Date(l.date), "dd/MM"),
            peso: maxWeight,
            "1RM": rm.epley,
          }
        }) ?? []
    : []

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
          {/* Month Navigation */}
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

          {/* Calendar Grid */}
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
                isSameDay(new Date(l.date), day)
              )
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isToday = isSameDay(day, new Date())
              const isSelected =
                selectedDate && isSameDay(day, selectedDate)

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
              )
            })}
          </div>

          {/* Month Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="p-3 text-center">
                <Dumbbell className="mx-auto h-4 w-4 text-primary mb-1" />
                <p className="text-lg font-bold text-foreground">
                  {monthLogs.length}
                </p>
                <p className="text-xs text-muted-foreground">Sesiones</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <TrendingUp className="mx-auto h-4 w-4 text-chart-2 mb-1" />
                <p className="text-lg font-bold text-foreground">
                  {monthVolume > 1000
                    ? `${(monthVolume / 1000).toFixed(1)}t`
                    : `${monthVolume}kg`}
                </p>
                <p className="text-xs text-muted-foreground">Volumen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Clock className="mx-auto h-4 w-4 text-chart-3 mb-1" />
                <p className="text-lg font-bold text-foreground">
                  {Math.round(monthDuration / 60)}m
                </p>
                <p className="text-xs text-muted-foreground">Tiempo</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Logs */}
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Sesiones recientes
          </h2>
          {(!allLogs || allLogs.length === 0) ? (
            <Card>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <CalendarOff className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Aun no hay entrenamientos registrados
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {allLogs?.slice(0, 10).map((log) => (
                <Card
                  key={log.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors active:scale-[0.98]"
                  onClick={() => {
                    setSelectedDate(new Date(log.date))
                    setSheetOpen(true)
                  }}
                >
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {log.routineName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.date), "EEEE dd MMM", {
                          locale: es,
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
                        {log.totalVolume > 1000
                          ? `${(log.totalVolume / 1000).toFixed(1)}t`
                          : `${log.totalVolume}kg`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round(log.duration / 60)} min
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="exercises">
          {/* Exercise Selector */}
          <div className="mb-4">
            <Select
              value={selectedExercise ?? ""}
              onValueChange={(v) => setSelectedExercise(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un ejercicio" />
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
                  <CardTitle className="text-sm">
                    Progreso: {selectedExercise}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={exerciseChartData}>
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
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="peso"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        name="Peso Max"
                      />
                      <Line
                        type="monotone"
                        dataKey="1RM"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 2 }}
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
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No hay historial para este ejercicio
                </p>
              </CardContent>
            </Card>
          )}

          {!selectedExercise && (
            <Card>
              <CardContent className="flex flex-col items-center py-8 text-center">
                <TrendingUp className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Selecciona un ejercicio para ver su progreso
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Day Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[70dvh] overflow-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>
              {selectedDate
                ? format(selectedDate, "EEEE dd 'de' MMMM yyyy", {
                    locale: es,
                  })
                : ""}
            </SheetTitle>
          </SheetHeader>

          <div className="px-4 pb-6">
            {selectedDayLog ? (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Dumbbell className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">
                      {selectedDayLog.routineName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(selectedDayLog.duration / 60)} min &middot;{" "}
                      {selectedDayLog.totalVolume > 1000
                        ? `${(selectedDayLog.totalVolume / 1000).toFixed(1)}t`
                        : `${selectedDayLog.totalVolume}kg`}{" "}
                      volumen
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {selectedDayLog.exercises.map((ex, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-semibold text-foreground mb-1.5">
                        {ex.exerciseName}
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">
                        {ex.muscleGroup}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ex.sets
                          .filter((s) => s.completed)
                          .map((s, si) => (
                            <span
                              key={si}
                              className="inline-flex items-center text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground"
                            >
                              {s.weight}kg x {s.reps}
                              {s.rpe === "hard" && (
                                <span className="ml-1 text-warning">!</span>
                              )}
                              {s.rpe === "failure" && (
                                <span className="ml-1 text-destructive">!!</span>
                              )}
                            </span>
                          ))}
                        {ex.sets.filter((s) => s.completed).length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Sin series completadas
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-center">
                <CalendarOff className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="font-medium text-foreground">
                  Dia de descanso
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No hubo entrenamiento este dia
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ExercisePRs({ exerciseName }: { exerciseName: string }) {
  const prs = useLiveQuery(
    () =>
      db.personalRecords
        .where("exerciseName")
        .equals(exerciseName)
        .toArray(),
    [exerciseName]
  )

  if (!prs || prs.length === 0) return null

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">Records Personales</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {prs.map((pr) => (
          <div
            key={pr.id}
            className="flex items-center justify-between py-2 border-b border-border last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-foreground capitalize">
                {pr.type === "weight"
                  ? "Mayor Peso"
                  : pr.type === "volume"
                    ? "Mayor Volumen"
                    : "Mayor Reps"}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(pr.date), "dd MMM yyyy", { locale: es })}
              </p>
            </div>
            <span className="text-sm font-bold text-accent">{pr.details}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
