"use client";

import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  estimateRoutineDuration,
  type Routine,
  type RoutineExercise,
} from "@/lib/db";
import {
  ExerciseFormDialog,
  DEFAULT_REST_PRESETS,
} from "./exercise-form-dialog";
import {
  findCatalogEquipment,
  EQUIPMENT_TYPE_LABELS,
} from "@/lib/equipment-catalog";
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
import {
  DAY_NAMES as DAYS,
  DAY_SELECT_OPTIONS,
  generateId,
} from "@/lib/utils";

// "Sin asignar" no aplica en el editor — se maneja aparte como dayOfWeek=null.
const DAY_OPTIONS = DAY_SELECT_OPTIONS.filter((o) => o.value !== "none");

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
    logs.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
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
  // The per-field exercise form state now lives inside <ExerciseFormDialog>;
  // we only need to know the index being edited (null = new) to know where
  // to put the result in the exercises array.

  // Snapshot of routine state on sheet open, used to detect unsaved changes
  // when the user tries to close. Stored as JSON string for cheap comparison.
  const sheetInitialSnapshotRef = useRef<string>("");

  function snapshotCurrent(): string {
    return JSON.stringify({
      name: routineName,
      day: routineDay,
      ex: exercises,
    });
  }

  function openNewRoutine() {
    setEditingRoutine(null);
    setRoutineName("");
    setRoutineDay("none");
    setExercises([]);
    sheetInitialSnapshotRef.current = JSON.stringify({
      name: "",
      day: "none",
      ex: [],
    });
    setSheetOpen(true);
  }

  function openEditRoutine(routine: Routine) {
    const day =
      routine.dayOfWeek !== null && routine.dayOfWeek !== undefined
        ? String(routine.dayOfWeek)
        : "none";
    const ex = [...routine.exercises];
    setEditingRoutine(routine);
    setRoutineName(routine.name);
    setRoutineDay(day);
    setExercises(ex);
    sheetInitialSnapshotRef.current = JSON.stringify({
      name: routine.name,
      day,
      ex,
    });
    setSheetOpen(true);
  }

  /** Wrap Sheet onOpenChange so closing with unsaved changes prompts a confirm. */
  function handleSheetOpenChange(open: boolean) {
    if (!open) {
      const dirty = snapshotCurrent() !== sheetInitialSnapshotRef.current;
      if (dirty) {
        const ok = confirm(
          "Tienes cambios sin guardar en esta rutina. ¿Cerrar igualmente?",
        );
        if (!ok) return;
      }
    }
    setSheetOpen(open);
  }

  function openNewExercise() {
    setEditingExerciseIndex(null);
    setExerciseDialogOpen(true);
  }

  function openEditExercise(index: number) {
    setEditingExerciseIndex(index);
    setExerciseDialogOpen(true);
  }

  function handleExerciseSave(exercise: RoutineExercise) {
    if (editingExerciseIndex !== null) {
      const updated = [...exercises];
      updated[editingExerciseIndex] = exercise;
      setExercises(updated);
    } else {
      setExercises([...exercises, exercise]);
    }
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
        onOpenChange={(open) => {
          if (!open) setHistoryRoutineId(null);
        }}
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
                        {format(new Date(log.date), "d MMM yyyy", {
                          locale: es,
                        })}
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
      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
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
                              {ex.equipmentId && (
                                <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                                  {findCatalogEquipment(ex.equipmentId)?.name
                                    ? (EQUIPMENT_TYPE_LABELS[
                                        findCatalogEquipment(ex.equipmentId)!
                                          .type
                                      ] ?? "Equipo")
                                    : "Equipo"}
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

      {/* Exercise Dialog — shared component with its own equipment picker. */}
      <ExerciseFormDialog
        open={exerciseDialogOpen}
        onOpenChange={setExerciseDialogOpen}
        initial={
          editingExerciseIndex !== null
            ? exercises[editingExerciseIndex] ?? null
            : null
        }
        onSave={handleExerciseSave}
        nameSuggestions={exerciseSuggestions}
        restPresets={DEFAULT_REST_PRESETS}
      />
    </div>
  );
}
