"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { db, getTodayRoutine, calculate1RM } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import {
  Dumbbell,
  TrendingUp,
  Flame,
  Clock,
  ChevronRight,
  Zap,
  Activity,
} from "lucide-react"
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  differenceInDays,
  format,
} from "date-fns"
import { es } from "date-fns/locale"
import { SmartSuggestions } from "./smart-suggestions"

export function DashboardContent() {
  const todayRoutine = useLiveQuery(() => getTodayRoutine())
  const workoutLogs = useLiveQuery(() =>
    db.workoutLogs.where("completed").equals(1).reverse().sortBy("date")
  )
  const routines = useLiveQuery(() => db.routines.toArray())
  const goals = useLiveQuery(() =>
    db.goals.where("completed").equals(0).toArray()
  )
  const personalRecords = useLiveQuery(() => db.personalRecords.toArray())

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const weekLogs =
    workoutLogs?.filter((l) =>
      isWithinInterval(new Date(l.date), { start: weekStart, end: weekEnd })
    ) ?? []
  const monthLogs =
    workoutLogs?.filter((l) =>
      isWithinInterval(new Date(l.date), { start: monthStart, end: monthEnd })
    ) ?? []

  const weeklyVolume = weekLogs.reduce((s, l) => s + l.totalVolume, 0)
  const weeklyDuration = weekLogs.reduce((s, l) => s + l.duration, 0)
  const monthlyVolume = monthLogs.reduce((s, l) => s + l.totalVolume, 0)

  // Consistency: workouts this week / routines assigned to days
  const assignedDays = routines?.filter((r) => r.dayOfWeek !== null).length ?? 0
  const consistency =
    assignedDays > 0
      ? Math.min(100, Math.round((weekLogs.length / assignedDays) * 100))
      : 0

  // Fatigue estimate based on weekly volume trend
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekLogs =
    workoutLogs?.filter((l) =>
      isWithinInterval(new Date(l.date), {
        start: prevWeekStart,
        end: weekStart,
      })
    ) ?? []
  const prevWeekVolume = prevWeekLogs.reduce((s, l) => s + l.totalVolume, 0)
  const volumeIncrease =
    prevWeekVolume > 0
      ? ((weeklyVolume - prevWeekVolume) / prevWeekVolume) * 100
      : 0

  let fatigueLevel: "Baja" | "Media" | "Alta" = "Baja"
  let fatigueColor = "text-success"
  if (volumeIncrease > 20 || weekLogs.length > 5) {
    fatigueLevel = "Alta"
    fatigueColor = "text-destructive"
  } else if (volumeIncrease > 10 || weekLogs.length > 4) {
    fatigueLevel = "Media"
    fatigueColor = "text-warning"
  }

  // IPP (Indice Personal de Progreso) - simplified composite score
  const recentPRs =
    personalRecords?.filter(
      (p) => differenceInDays(now, new Date(p.date)) < 30
    ).length ?? 0
  const ipp = Math.min(
    100,
    Math.round(consistency * 0.4 + Math.min(recentPRs * 10, 30) + (weeklyVolume > 0 ? 30 : 0))
  )

  const dayName = format(now, "EEEE", { locale: es })

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground capitalize">
          {dayName}, {format(now, "d MMM yyyy", { locale: es })}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          Juan Traning
        </h1>
      </div>

      {/* Today's Routine CTA */}
      <Card className="mb-4 border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          {todayRoutine ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary uppercase tracking-wide">
                  Rutina de hoy
                </p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {todayRoutine.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {todayRoutine.exercises.length} ejercicios
                </p>
              </div>
              <Link href={`/workout/${todayRoutine.id}`}>
                <Button size="lg" className="gap-2 rounded-xl font-semibold">
                  <Dumbbell className="h-5 w-5" />
                  Comenzar
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  No tienes rutina asignada para hoy
                </p>
              </div>
              <Link href="/routines">
                <Button variant="outline" size="sm" className="gap-1">
                  Ver rutinas
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium">Vol. Semanal</span>
            </div>
            <p className="mt-2 text-xl font-bold text-foreground">
              {weeklyVolume > 1000
                ? `${(weeklyVolume / 1000).toFixed(1)}t`
                : `${weeklyVolume}kg`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 text-chart-2" />
              <span className="text-xs font-medium">Tiempo Semanal</span>
            </div>
            <p className="mt-2 text-xl font-bold text-foreground">
              {weeklyDuration > 3600
                ? `${(weeklyDuration / 3600).toFixed(1)}h`
                : `${Math.round(weeklyDuration / 60)}m`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Flame className="h-4 w-4 text-chart-3" />
              <span className="text-xs font-medium">Consistencia</span>
            </div>
            <p className="mt-2 text-xl font-bold text-foreground">
              {consistency}%
            </p>
            <Progress value={consistency} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Activity className={`h-4 w-4 ${fatigueColor}`} />
              <span className="text-xs font-medium">Fatiga</span>
            </div>
            <p className={`mt-2 text-xl font-bold ${fatigueColor}`}>
              {fatigueLevel}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IPP */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Indice Personal de Progreso
                </p>
                <p className="text-xs text-muted-foreground">
                  Fuerza + Volumen + Consistencia
                </p>
              </div>
            </div>
            <span className="text-2xl font-bold text-primary">{ipp}</span>
          </div>
          <Progress value={ipp} className="mt-3 h-2" />
        </CardContent>
      </Card>

      {/* Smart Progression Suggestions */}
      <SmartSuggestions />

      {/* Goals Preview */}
      {goals && goals.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                Objetivos activos
              </CardTitle>
              <Link
                href="/goals"
                className="text-xs text-primary font-medium"
              >
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {goals.slice(0, 3).map((goal) => {
              const progress =
                goal.targetValue > goal.startValue
                  ? Math.round(
                    ((goal.currentValue - goal.startValue) /
                      (goal.targetValue - goal.startValue)) *
                    100
                  )
                  : 0
              return (
                <div key={goal.id} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{goal.description}</span>
                    <span className="font-medium text-primary">
                      {Math.max(0, Math.min(100, progress))}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, Math.min(100, progress))}
                    className="mt-1 h-1.5"
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Monthly volume */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Vol. Mensual
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {monthlyVolume > 1000
                  ? `${(monthlyVolume / 1000).toFixed(1)}t`
                  : `${monthlyVolume}kg`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground">
                Sesiones este mes
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {monthLogs.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent PRs */}
      {personalRecords && personalRecords.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">
              Records Personales Recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {personalRecords
              .sort(
                (a, b) =>
                  new Date(b.date).getTime() - new Date(a.date).getTime()
              )
              .slice(0, 5)
              .map((pr) => (
                <div
                  key={pr.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {pr.exerciseName}
                    </p>
                    <p className="text-xs text-muted-foreground">{pr.type}</p>
                  </div>
                  <span className="text-sm font-bold text-accent">
                    {pr.details}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
