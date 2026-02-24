"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { db, type WorkoutLog, type WorkoutSetLog } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Brain, TrendingUp, TrendingDown, RotateCcw, Dumbbell } from "lucide-react"
import {
  startOfWeek,
  endOfWeek,
  subWeeks,
  isWithinInterval,
} from "date-fns"

interface Suggestion {
  exerciseName: string
  type: "increase" | "decrease" | "deload" | "adjust"
  message: string
}

export function SmartSuggestions() {
  const workoutLogs = useLiveQuery(() =>
    db.workoutLogs.where("completed").equals(1).reverse().sortBy("date")
  )

  if (!workoutLogs || workoutLogs.length < 3) return null

  const suggestions = analyzeProgression(workoutLogs)

  if (suggestions.length === 0) return null

  return (
    <Card className="mb-4 border-primary/20">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Brain className="h-4 w-4 text-primary" />
          Sugerencias de Progresion
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {suggestions.slice(0, 4).map((s, i) => (
          <div
            key={i}
            className="flex items-start gap-2 py-2 border-b border-border last:border-0"
          >
            {s.type === "increase" && (
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            )}
            {s.type === "decrease" && (
              <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            )}
            {s.type === "deload" && (
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            {s.type === "adjust" && (
              <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                {s.exerciseName}
              </p>
              <p className="text-xs text-muted-foreground">{s.message}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function analyzeProgression(logs: WorkoutLog[]): Suggestion[] {
  const suggestions: Suggestion[] = []
  const now = new Date()

  // Get unique exercise names from recent workouts (last 4 weeks)
  const recentLogs = logs.filter(
    (l) =>
      new Date(l.date).getTime() > subWeeks(now, 4).getTime()
  )

  const exerciseMap = new Map<
    string,
    { weights: number[]; rpes: string[]; dates: Date[] }
  >()

  for (const log of recentLogs) {
    for (const ex of log.exercises) {
      const completed = ex.sets.filter((s) => s.completed)
      if (completed.length === 0) continue

      if (!exerciseMap.has(ex.exerciseName)) {
        exerciseMap.set(ex.exerciseName, {
          weights: [],
          rpes: [],
          dates: [],
        })
      }
      const entry = exerciseMap.get(ex.exerciseName)!
      const maxWeight = Math.max(...completed.map((s) => s.weight))
      entry.weights.push(maxWeight)
      entry.rpes.push(...completed.map((s) => s.rpe))
      entry.dates.push(new Date(log.date))
    }
  }

  for (const [name, data] of exerciseMap) {
    // 1. Check if all reps completed easily consistently
    const easyCount = data.rpes.filter((r) => r === "easy").length
    const totalRpes = data.rpes.length
    if (easyCount / totalRpes > 0.6 && data.weights.length >= 2) {
      suggestions.push({
        exerciseName: name,
        type: "increase",
        message: "Completando series facilmente. Aumenta 2.5-5kg.",
      })
      continue
    }

    // 2. Check for stagnation (same weight for 3+ sessions)
    const uniqueWeights = [...new Set(data.weights)]
    if (
      uniqueWeights.length === 1 &&
      data.weights.length >= 3
    ) {
      suggestions.push({
        exerciseName: name,
        type: "adjust",
        message:
          "Mismo peso en las ultimas sesiones. Intenta micro-progresar (+1-2.5kg) o cambiar reps.",
      })
      continue
    }

    // 3. Check for high RPE consistently
    const hardCount = data.rpes.filter(
      (r) => r === "hard" || r === "failure"
    ).length
    if (hardCount / totalRpes > 0.7 && data.weights.length >= 3) {
      suggestions.push({
        exerciseName: name,
        type: "deload",
        message:
          "RPE alto constante. Considera una semana de descarga (-40% volumen).",
      })
      continue
    }

    // 4. Check for declining performance
    if (data.weights.length >= 3) {
      const lastThree = data.weights.slice(-3)
      if (lastThree[0] > lastThree[1] && lastThree[1] > lastThree[2]) {
        suggestions.push({
          exerciseName: name,
          type: "decrease",
          message:
            "Rendimiento decreciente. Reduce volumen o toma descanso extra.",
        })
      }
    }
  }

  return suggestions
}
