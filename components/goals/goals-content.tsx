"use client"

import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db, type Goal } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Target,
  Trash2,
  Check,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react"
import {
  format,
  differenceInDays,
  differenceInWeeks,
  addWeeks,
} from "date-fns"
import { es } from "date-fns/locale"

export function GoalsContent() {
  const [showForm, setShowForm] = useState(false)
  const goals = useLiveQuery(() => db.goals.toArray())

  const activeGoals = goals?.filter((g) => !g.completed) ?? []
  const completedGoals = goals?.filter((g) => g.completed) ?? []

  async function handleDelete(id: number) {
    if (confirm("Eliminar este objetivo?")) {
      await db.goals.delete(id)
    }
  }

  async function handleComplete(id: number) {
    await db.goals.update(id, { completed: true })
  }

  if (showForm) {
    return <GoalForm onClose={() => setShowForm(false)} />
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Objetivos</h1>
        <Button
          onClick={() => setShowForm(true)}
          size="sm"
          className="gap-1.5 rounded-xl"
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {activeGoals.length === 0 && completedGoals.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Target className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium text-foreground">
              Sin objetivos
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primer objetivo para mantenerte motivado
            </p>
            <Button
              onClick={() => setShowForm(true)}
              className="mt-4 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Crear Objetivo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Goals */}
      {activeGoals.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Activos
          </h2>
          <div className="flex flex-col gap-3">
            {activeGoals.map((goal) => {
              const progress =
                goal.targetValue > goal.startValue
                  ? Math.round(
                      ((goal.currentValue - goal.startValue) /
                        (goal.targetValue - goal.startValue)) *
                        100
                    )
                  : 0
              const clamped = Math.max(0, Math.min(100, progress))
              const daysLeft = differenceInDays(
                new Date(goal.targetDate),
                new Date()
              )
              const totalDays = differenceInDays(
                new Date(goal.targetDate),
                new Date(goal.startDate)
              )
              const timeProgress =
                totalDays > 0
                  ? Math.round(
                      ((totalDays - daysLeft) / totalDays) * 100
                    )
                  : 100
              const behind = timeProgress > clamped + 15

              return (
                <Card key={goal.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">
                          {goal.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {goal.type === "weight"
                            ? `${goal.currentValue}kg / ${goal.targetValue}kg`
                            : goal.type === "frequency"
                              ? `${goal.currentValue} / ${goal.targetValue} dias`
                              : `${goal.currentValue}kg / ${goal.targetValue}kg`}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleComplete(goal.id!)}
                        >
                          <Check className="h-3.5 w-3.5 text-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(goal.id!)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={clamped} className="h-2 mb-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{clamped}% completado</span>
                      <span className="flex items-center gap-1">
                        {behind && (
                          <AlertTriangle className="h-3 w-3 text-warning" />
                        )}
                        {daysLeft > 0
                          ? `${daysLeft} dias restantes`
                          : "Plazo vencido"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Completados
          </h2>
          <div className="flex flex-col gap-2">
            {completedGoals.map((goal) => (
              <Card key={goal.id} className="opacity-60">
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground line-through">
                      {goal.description}
                    </p>
                  </div>
                  <Check className="h-4 w-4 text-success" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GoalForm({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<"weight" | "frequency" | "bodyweight">(
    "weight"
  )
  const [description, setDescription] = useState("")
  const [exerciseName, setExerciseName] = useState("")
  const [targetValue, setTargetValue] = useState(0)
  const [currentValue, setCurrentValue] = useState(0)
  const [weeks, setWeeks] = useState(8)

  async function handleSave() {
    if (!description.trim()) return

    const goal: Omit<Goal, "id"> = {
      type,
      description: description.trim(),
      exerciseName: type === "weight" ? exerciseName : undefined,
      targetValue,
      currentValue,
      startValue: currentValue,
      startDate: new Date(),
      targetDate: addWeeks(new Date(), weeks),
      completed: false,
      createdAt: new Date(),
    }

    await db.goals.add(goal as Goal)
    onClose()
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-foreground">Nuevo Objetivo</h1>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <Label>Tipo de objetivo</Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as typeof type)}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weight">
                Subir peso en un ejercicio
              </SelectItem>
              <SelectItem value="frequency">
                Frecuencia de entrenamiento
              </SelectItem>
              <SelectItem value="bodyweight">Peso corporal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Descripcion</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: Sentadilla a 120kg"
            className="mt-1.5"
          />
        </div>

        {type === "weight" && (
          <div>
            <Label>Nombre del ejercicio</Label>
            <Input
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              placeholder="Ej: Press Banca"
              className="mt-1.5"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Valor actual</Label>
            <Input
              type="number"
              min={0}
              value={currentValue}
              onChange={(e) =>
                setCurrentValue(parseFloat(e.target.value) || 0)
              }
              className="mt-1.5"
            />
          </div>
          <div>
            <Label>Valor objetivo</Label>
            <Input
              type="number"
              min={0}
              value={targetValue}
              onChange={(e) =>
                setTargetValue(parseFloat(e.target.value) || 0)
              }
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label>Plazo (semanas)</Label>
          <Input
            type="number"
            min={1}
            value={weeks}
            onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
            className="mt-1.5"
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={!description.trim() || targetValue <= 0}
          className="mt-4 w-full rounded-xl py-6 text-base font-semibold"
          size="lg"
        >
          Crear Objetivo
        </Button>
      </div>
    </div>
  )
}
