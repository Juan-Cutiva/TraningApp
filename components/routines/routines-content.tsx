"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  estimateRoutineDuration,
  type Routine,
  type RoutineExercise,
} from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit2,
  Trash2,
  Dumbbell,
  ChevronRight,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Link2,
  Copy,
  History,
  Clock,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const DAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
];

const DAY_OPTIONS = [
  { value: "0", label: "Domingo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miercoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sabado" },
];

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
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Helper to parse number or return default
function parseNumber(value: string | number, defaultValue: number): number {
  if (typeof value === "number") return value;
  if (value === "") return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function RoutinesContent() {
  const routines = useLiveQuery(() => db.routines.toArray());

  const exerciseSuggestions = useLiveQuery(async () => {
    const logs = await db.workoutLogs.toArray();
    const names = new Set<string>();
    logs.forEach((l) => l.exercises.forEach((e) => names.add(e.exerciseName)));
    return Array.from(names).sort();
  }, []);

  // History dialog state
  const [historyRoutineId, setHistoryRoutineId] = useState<number | null>(null);
  const [historyRoutineName, setHistoryRoutineName] = useState("");

  const routineHistory = useLiveQuery(async () => {
    if (!historyRoutineId) return null;
    const logs = await db.workoutLogs
      .where("routineId")
      .equals(historyRoutineId)
      .toArray();
    logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return logs.slice(0, 10);
  }, [historyRoutineId]);

  // Routine sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [routineName, setRoutineName] = useState("");
  const [routineDay, setRoutineDay] = useState("none");
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);

  // Exercise dialog state
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<
    number | null
  >(null);
  const [exName, setExName] = useState("");
  const [exMuscle, setExMuscle] = useState("Pecho");
  const [exSets, setExSets] = useState<string>("3");
  const [exReps, setExReps] = useState<string | number>("10");
  const [exWeight, setExWeight] = useState<string>("0");
  const [exUnit, setExUnit] = useState<string>("kg");
  const [exRest, setExRest] = useState<string>("150");

  function openNewRoutine() {
    setEditingRoutine(null);
    setRoutineName("");
    setRoutineDay("none");
    setExercises([]);
    setSheetOpen(true);
  }

  function openEditRoutine(routine: Routine) {
    setEditingRoutine(routine);
    setRoutineName(routine.name);
    setRoutineDay(
      routine.dayOfWeek !== null && routine.dayOfWeek !== undefined
        ? String(routine.dayOfWeek)
        : "none",
    );
    setExercises([...routine.exercises]);
    setSheetOpen(true);
  }

  function openNewExercise() {
    setEditingExerciseIndex(null);
    setExName("");
    setExMuscle("Pecho");
    setExSets("3");
    setExReps("10");
    setExWeight("0");
    setExUnit("kg");
    setExRest("150");
    setExerciseDialogOpen(true);
  }

  function openEditExercise(index: number) {
    const ex = exercises[index];
    setEditingExerciseIndex(index);
    setExName(ex.name);
    setExMuscle(ex.muscleGroup);
    setExSets(String(ex.sets));
    setExReps(ex.reps);
    setExWeight(String(ex.targetWeight));
    setExUnit(ex.unit || "kg");
    setExRest(String(ex.restSeconds));
    setExerciseDialogOpen(true);
  }

  function saveExercise() {
    if (!exName.trim()) return;

    const existingExercise =
      editingExerciseIndex !== null ? exercises[editingExerciseIndex] : null;

    const exercise: RoutineExercise = {
      id: existingExercise?.id || generateId(),
      name: exName.trim(),
      muscleGroup: exMuscle,
      sets: parseNumber(exSets, 3),
      reps: exReps,
      targetWeight: parseNumber(exWeight, 0),
      unit: exUnit,
      restSeconds: parseNumber(exRest, 150),
      supersetId: existingExercise?.supersetId,
    };

    if (editingExerciseIndex !== null) {
      const updated = [...exercises];
      updated[editingExerciseIndex] = exercise;
      setExercises(updated);
    } else {
      setExercises([...exercises, exercise]);
    }
    setExerciseDialogOpen(false);
  }

  function removeExercise(index: number) {
    setExercises(exercises.filter((_, i) => i !== index));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    if (index + direction < 0 || index + direction >= exercises.length) return;
    const newEx = [...exercises];
    const temp = newEx[index];
    newEx[index] = newEx[index + direction];
    newEx[index + direction] = temp;
    setExercises(newEx);
  }

  function toggleSuperset(index: number) {
    if (index >= exercises.length - 1) return;
    const newEx = [...exercises];
    const currentId = newEx[index].supersetId;
    const nextId = newEx[index + 1].supersetId;

    if (currentId && currentId === nextId) {
      newEx[index + 1].supersetId = undefined;
    } else {
      const newId = currentId || nextId || generateId();
      newEx[index].supersetId = newId;
      newEx[index + 1].supersetId = newId;
    }
    setExercises(newEx);
  }

  async function saveRoutine() {
    if (!routineName.trim() || exercises.length === 0) return;

    const data = {
      name: routineName.trim(),
      dayOfWeek: routineDay === "none" ? null : parseInt(routineDay),
      exercises,
      updatedAt: new Date(),
    };

    if (editingRoutine?.id) {
      await db.routines.update(editingRoutine.id, data);
    } else {
      await db.routines.add({
        ...data,
        createdAt: new Date(),
      } as Routine);
    }
    setSheetOpen(false);
  }

  async function handleDelete(id: number) {
    if (confirm("¿Eliminar esta rutina?")) {
      await db.routines.delete(id);
    }
  }

  function cloneRoutine(routine: Routine) {
    setEditingRoutine(null);
    setRoutineName(`Copia de ${routine.name}`);
    setRoutineDay(
      routine.dayOfWeek !== null && routine.dayOfWeek !== undefined
        ? String(routine.dayOfWeek)
        : "none",
    );
    setExercises(routine.exercises.map((ex) => ({ ...ex, id: generateId() })));
    setSheetOpen(true);
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Rutinas</h1>
        <Button
          onClick={openNewRoutine}
          size="sm"
          className="gap-1.5 rounded-xl px-4"
        >
          <Plus className="h-4 w-4" />
          Nueva
        </Button>
      </div>

      {!routines || routines.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Dumbbell className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-semibold text-foreground">
              Sin rutinas creadas
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-62.5">
              Crea tu primera rutina para empezar a entrenar
            </p>
            <Button onClick={openNewRoutine} className="mt-5 gap-1.5 px-6">
              <Plus className="h-4 w-4" />
              Crear Rutina
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {routines.map((routine) => (
            <Card
              key={routine.id}
              className="overflow-hidden hover:shadow-md transition-shadow"
            >
              <CardContent className="p-0">
                <div className="flex items-center">
                  <Link
                    href={`/workout/${routine.id}`}
                    className="flex flex-1 items-center gap-4 p-4"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Dumbbell className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-lg">
                        {routine.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {routine.dayOfWeek !== null
                          ? DAYS[routine.dayOfWeek]
                          : "Sin asignar"}{" "}
                        • {routine.exercises.length} ej. • ~
                        {Math.round(estimateRoutineDuration(routine) / 60)} min
                        aprox
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/50" />
                  </Link>
                  <div className="flex items-center gap-1 pr-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      title="Ver historial"
                      onClick={() => {
                        setHistoryRoutineId(routine.id!);
                        setHistoryRoutineName(routine.name);
                      }}
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      title="Duplicar rutina"
                      onClick={() => cloneRoutine(routine)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => openEditRoutine(routine)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive"
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

      {/* History Dialog */}
      <Dialog
        open={historyRoutineId !== null}
        onOpenChange={(open) => { if (!open) setHistoryRoutineId(null); }}
      >
        <DialogContent className="max-w-sm rounded-2xl max-h-[80dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {historyRoutineName}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-3 pr-1">
            {!routineHistory ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Cargando...
              </p>
            ) : routineHistory.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Sin entrenamientos registrados aún.
                </p>
              </div>
            ) : (
              routineHistory.map((log, i) => {
                const mins = Math.round(log.duration / 60);
                return (
                  <div
                    key={log.id ?? i}
                    className="rounded-xl border bg-card p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-foreground">
                        {format(new Date(log.date), "d MMM yyyy", { locale: es })}
                      </p>
                      {log.completed && (
                        <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
                          Completado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {mins} min
                      </span>
                      <span>{log.exercises.length} ejercicios</span>
                    </div>
                    {log.notes && (
                      <p className="text-xs text-muted-foreground italic border-t border-border/40 pt-1 mt-1">
                        "{log.notes}"
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setHistoryRoutineId(null)}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Routine Sheet (Bottom) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-auto rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-xl">
              {editingRoutine ? "Editar Rutina" : "Nueva Rutina"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 py-2">
            <div>
              <Label htmlFor="routine-name" className="text-sm font-medium">
                Nombre de la rutina
              </Label>
              <Input
                id="routine-name"
                value={routineName}
                onChange={(e) => setRoutineName(e.target.value)}
                placeholder="Ej: Push Day, Piernas..."
                className="mt-1.5 h-11"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Día de la semana</Label>
              <Select value={routineDay} onValueChange={setRoutineDay}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue placeholder="Seleccionar día" />
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
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Ejercicios</Label>
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
                <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 py-10 text-center">
                  <Dumbbell className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Agrega ejercicios a tu rutina
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {exercises.map((ex, i) => {
                    const isLinkedToNext =
                      i < exercises.length - 1 &&
                      ex.supersetId &&
                      ex.supersetId === exercises[i + 1].supersetId;

                    return (
                      <div key={ex.id} className="relative">
                        <div
                          className={`flex items-center gap-2 rounded-xl border p-3 transition-colors
                            ${ex.supersetId ? "bg-primary/5 border-primary/30" : "bg-card border-border"}
                          `}
                        >
                          <div className="flex flex-col items-center justify-center shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/60 p-0"
                              onClick={() => moveExercise(i, -1)}
                              disabled={i === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/60 p-0"
                              onClick={() => moveExercise(i, 1)}
                              disabled={i === exercises.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <button
                            className="flex flex-1 flex-col text-left min-w-0 px-2"
                            onClick={() => openEditExercise(i)}
                          >
                            <span className="font-semibold text-foreground flex items-center gap-2">
                              {ex.name || "Sin nombre"}
                              {ex.supersetId && (
                                <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  SS
                                </span>
                              )}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {ex.muscleGroup} • {ex.sets}×{ex.reps}
                              {ex.targetWeight > 0
                                ? ` @ ${ex.targetWeight}${ex.unit || "kg"}`
                                : ""}
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive shrink-0"
                            onClick={() => removeExercise(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {i < exercises.length - 1 && (
                          <div className="flex justify-center -my-2 relative z-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-7 w-7 rounded-full border-2 bg-background shadow-sm transition-colors ${
                                isLinkedToNext
                                  ? "text-primary border-primary bg-primary/10 hover:bg-primary/20"
                                  : "text-muted-foreground/40 border-border hover:text-foreground"
                              }`}
                              onClick={() => toggleSuperset(i)}
                              title="Vincular como Súper Serie"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="px-4 pb-6 pt-4">
            <Button
              onClick={saveRoutine}
              disabled={!routineName.trim() || exercises.length === 0}
              className="w-full rounded-xl py-6 text-lg font-semibold"
              size="lg"
            >
              {editingRoutine ? "Guardar Cambios" : "Crear Rutina"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Exercise Dialog */}
      <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {editingExerciseIndex !== null
                ? "Editar Ejercicio"
                : "Nuevo Ejercicio"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <datalist id="exercise-suggestions">
              {exerciseSuggestions?.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div>
              <Label className="text-sm font-medium">
                Nombre del ejercicio
              </Label>
              <Input
                value={exName}
                onChange={(e) => setExName(e.target.value)}
                placeholder="Ej: Press banca, Sentadilla..."
                className="mt-1 h-11"
                list="exercise-suggestions"
                autoComplete="off"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Grupo muscular</Label>
              <Select value={exMuscle} onValueChange={setExMuscle}>
                <SelectTrigger className="mt-1 h-11">
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
                  type="text"
                  inputMode="numeric"
                  value={exSets}
                  onChange={(e) => setExSets(e.target.value)}
                  className="mt-1 h-11"
                  placeholder="3"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Repeticiones
                </Label>
                <Input
                  type="text"
                  value={exReps}
                  onChange={(e) => setExReps(e.target.value)}
                  className="mt-1 h-11"
                  placeholder="10 o 8-12"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Peso
                </Label>
                <div className="flex mt-1 items-center gap-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={exWeight}
                    onChange={(e) => setExWeight(e.target.value)}
                    className="h-11 flex-1"
                    placeholder="0"
                  />
                  <Select value={exUnit} onValueChange={setExUnit}>
                    <SelectTrigger className="h-11 w-20 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="lb">lb</SelectItem>
                      <SelectItem value="otro">otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Descanso (segundos)</Label>
              <Select
                value={String(exRest)}
                onValueChange={(v) => setExRest(v)}
              >
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10s (10 seg)</SelectItem>
                  <SelectItem value="15">15s (15 seg)</SelectItem>
                  <SelectItem value="30">30s (30 seg)</SelectItem>
                  <SelectItem value="60">60s (1 min)</SelectItem>
                  <SelectItem value="90">90s (1.5 min)</SelectItem>
                  <SelectItem value="120">120s (2 min)</SelectItem>
                  <SelectItem value="150">150s (2.5 min)</SelectItem>
                  <SelectItem value="180">180s (3 min)</SelectItem>
                  <SelectItem value="240">240s (4 min)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExerciseDialogOpen(false)}
              className="h-11"
            >
              Cancelar
            </Button>
            <Button
              onClick={saveExercise}
              disabled={!exName.trim()}
              className="h-11 px-6"
            >
              {editingExerciseIndex !== null ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
