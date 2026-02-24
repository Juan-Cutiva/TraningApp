"use client"

import { useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db, type Routine, type RoutineExercise } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Plus,
  Edit2,
  Trash2,
  Dumbbell,
  ChevronRight,
  GripVertical,
} from "lucide-react"
import Link from "next/link"

const DAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
]

const DAY_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miercoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sabado" },
]

const MUSCLE_GROUPS = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Biceps",
  "Triceps",
  "Piernas",
  "Gluteos",
  "Abdominales",
  "Trapecio",
  "Antebrazos",
  "Pantorrillas",
  "Full Body",
]

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

export function RoutinesContent() {
  const routines = useLiveQuery(() => db.routines.toArray())

  // Routine sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null)
  const [routineName, setRoutineName] = useState("")
  const [routineDay, setRoutineDay] = useState("none")
  const [exercises, setExercises] = useState<RoutineExercise[]>([])

  // Exercise dialog state
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false)
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<
    number | null
  >(null)
  const [exName, setExName] = useState("")
  const [exMuscle, setExMuscle] = useState("Pecho")
  const [exSets, setExSets] = useState(3)
  const [exReps, setExReps] = useState(10)
  const [exWeight, setExWeight] = useState(0)
  const [exRest, setExRest] = useState(150)

  function openNewRoutine() {
    setEditingRoutine(null)
    setRoutineName("")
    setRoutineDay("none")
    setExercises([])
    setSheetOpen(true)
  }

  function openEditRoutine(routine: Routine) {
    setEditingRoutine(routine)
    setRoutineName(routine.name)
    setRoutineDay(
      routine.dayOfWeek !== null && routine.dayOfWeek !== undefined
        ? String(routine.dayOfWeek)
        : "none"
    )
    setExercises([...routine.exercises])
    setSheetOpen(true)
  }

  function openNewExercise() {
    setEditingExerciseIndex(null)
    setExName("")
    setExMuscle("Pecho")
    setExSets(3)
    setExReps(10)
    setExWeight(0)
    setExRest(150)
    setExerciseDialogOpen(true)
  }

  function openEditExercise(index: number) {
    const ex = exercises[index]
    setEditingExerciseIndex(index)
    setExName(ex.name)
    setExMuscle(ex.muscleGroup)
    setExSets(ex.sets)
    setExReps(ex.reps)
    setExWeight(ex.targetWeight)
    setExRest(ex.restSeconds)
    setExerciseDialogOpen(true)
  }

  function saveExercise() {
    if (!exName.trim()) return

    const exercise: RoutineExercise = {
      id: editingExerciseIndex !== null ? exercises[editingExerciseIndex].id : generateId(),
      name: exName.trim(),
      muscleGroup: exMuscle,
      sets: exSets,
      reps: exReps,
      targetWeight: exWeight,
      restSeconds: exRest,
    }

    if (editingExerciseIndex !== null) {
      const updated = [...exercises]
      updated[editingExerciseIndex] = exercise
      setExercises(updated)
    } else {
      setExercises([...exercises, exercise])
    }
    setExerciseDialogOpen(false)
  }

  function removeExercise(index: number) {
    setExercises(exercises.filter((_, i) => i !== index))
  }

  async function saveRoutine() {
    if (!routineName.trim() || exercises.length === 0) return

    const data = {
      name: routineName.trim(),
      dayOfWeek: routineDay === "none" ? null : parseInt(routineDay),
      exercises,
      updatedAt: new Date(),
    }

    if (editingRoutine?.id) {
      await db.routines.update(editingRoutine.id, data)
    } else {
      await db.routines.add({
        ...data,
        createdAt: new Date(),
      } as Routine)
    }
    setSheetOpen(false)
  }

  async function handleDelete(id: number) {
    if (confirm("Eliminar esta rutina?")) {
      await db.routines.delete(id)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Rutinas</h1>
        <Button
          onClick={openNewRoutine}
          size="sm"
          className="gap-1.5 rounded-xl"
        >
          <Plus className="h-4 w-4" />
          Nueva
        </Button>
      </div>

      {!routines || routines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Dumbbell className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-lg font-medium text-foreground">
              Sin rutinas creadas
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea tu primera rutina para empezar a entrenar
            </p>
            <Button onClick={openNewRoutine} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              Crear Rutina
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {routines.map((routine) => (
            <Card key={routine.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center">
                  <Link
                    href={`/workout/${routine.id}`}
                    className="flex flex-1 items-center gap-3 p-4"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Dumbbell className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {routine.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {routine.dayOfWeek !== null
                          ? DAYS[routine.dayOfWeek]
                          : "Sin asignar"}{" "}
                        &middot; {routine.exercises.length} ejercicios
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                  </Link>
                  <div className="flex items-center gap-1 pr-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEditRoutine(routine)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDelete(routine.id!)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Routine Sheet (Bottom) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>
              {editingRoutine ? "Editar Rutina" : "Nueva Rutina"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4">
            <div>
              <Label htmlFor="routine-name">Nombre</Label>
              <Input
                id="routine-name"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="Ej: Push Day, Piernas..."
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Dia de la semana</Label>
              <Select value={routineDay} onValueChange={setRoutineDay}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Seleccionar dia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {DAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exercises List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base">Ejercicios</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-lg"
                  onClick={openNewExercise}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </Button>
              </div>

              {exercises.length === 0 ? (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 py-8 text-center">
                  <Dumbbell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Agrega ejercicios a tu rutina
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {exercises.map((ex, i) => (
                    <div
                      key={ex.id}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      <button
                        className="flex flex-1 flex-col text-left min-w-0"
                        onClick={() => openEditExercise(i)}
                      >
                        <span className="text-sm font-medium text-foreground truncate">
                          {ex.name || "Sin nombre"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ex.muscleGroup} &middot; {ex.sets}x{ex.reps}
                          {ex.targetWeight > 0
                            ? ` @ ${ex.targetWeight}kg`
                            : ""}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive shrink-0"
                        onClick={() => removeExercise(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <SheetFooter>
            <Button
              onClick={saveRoutine}
              disabled={!routineName.trim() || exercises.length === 0}
              className="w-full rounded-xl py-6 text-base font-semibold"
              size="lg"
            >
              {editingRoutine ? "Guardar Cambios" : "Crear Rutina"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Exercise Dialog */}
      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>
              {editingExerciseIndex !== null
                ? "Editar Ejercicio"
                : "Nuevo Ejercicio"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <Label>Nombre del ejercicio</Label>
              <Input
                value={exName}
                onChange={(e) => setExName(e.target.value)}
                placeholder="Ej: Press banca, Sentadilla..."
                className="mt-1"
              />
            </div>

            <div>
              <Label>Grupo muscular</Label>
              <Select value={exMuscle} onValueChange={setExMuscle}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Series</Label>
                <Input
                  type="number"
                  min={1}
                  value={exSets}
                  onChange={(e) => setExSets(parseInt(e.target.value) || 1)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Repeticiones
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={exReps}
                  onChange={(e) => setExReps(parseInt(e.target.value) || 1)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Peso (kg)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={exWeight}
                  onChange={(e) =>
                    setExWeight(parseFloat(e.target.value) || 0)
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Descanso (segundos)
              </Label>
              <Input
                type="number"
                min={30}
                step={15}
                value={exRest}
                onChange={(e) => setExRest(parseInt(e.target.value) || 150)}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExerciseDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={saveExercise} disabled={!exName.trim()}>
              {editingExerciseIndex !== null ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
