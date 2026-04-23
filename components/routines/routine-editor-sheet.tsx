"use client";

import { useEffect, useRef, useState } from "react";
import type { RoutineExercise } from "@/lib/db";
import {
  ExerciseFormDialog,
  DEFAULT_REST_PRESETS,
} from "./exercise-form-dialog";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn, DAY_SELECT_OPTIONS, generateId } from "@/lib/utils";

/**
 * Shape the sheet emits via `onSave` — matches both `Routine` (Dexie) and
 * `BaseRoutineTemplate` (admin) since they share the same structure sans
 * createdAt/updatedAt/id.
 */
export interface RoutineDraft {
  name: string;
  dayOfWeek: number | null;
  exercises: RoutineExercise[];
}

interface RoutineEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial data. null → "new routine" mode. */
  initial: RoutineDraft | null;
  /** Called with the finished draft when the user taps save. */
  onSave: (draft: RoutineDraft) => void;
  /** Save button label. Changes by context ("Crear Rutina" vs "Guardar Cambios"). */
  saveLabel?: string;
  /** Sheet title. Defaults: "Editar Rutina" or "Nueva Rutina". */
  title?: string;
  /** Autocomplete suggestions for the exercise name field. */
  exerciseSuggestions?: string[];
  /**
   * If true, the exercise Dialog uses a rest-Select with common presets;
   * if false, a free-form numeric Input (used by admin base-routines editor
   * where any value is fair game).
   */
  useRestPresets?: boolean;
  /** Include "Sin asignar" in the day select. Defaults true. */
  allowNoDay?: boolean;
}

const DAY_OPTIONS_WITH_NONE = DAY_SELECT_OPTIONS;
const DAY_OPTIONS_WITHOUT_NONE = DAY_SELECT_OPTIONS.filter(
  (o) => o.value !== "none",
);

export function RoutineEditorSheet({
  open,
  onOpenChange,
  initial,
  onSave,
  saveLabel,
  title,
  exerciseSuggestions,
  useRestPresets = true,
  allowNoDay = true,
}: RoutineEditorSheetProps) {
  const [name, setName] = useState("");
  const [day, setDay] = useState<string>("none");
  const [exercises, setExercises] = useState<RoutineExercise[]>([]);

  const [exDialogOpen, setExDialogOpen] = useState(false);
  const [editingExIndex, setEditingExIndex] = useState<number | null>(null);

  // Snapshot used to detect unsaved changes when the user tries to close
  // the sheet without saving.
  const initialSnapshotRef = useRef<string>("");

  // Reset state whenever the sheet opens with new initial data. Done in
  // useEffect so React finishes reconciliation before the refs/state settle.
  useEffect(() => {
    if (!open) return;
    const nextName = initial?.name ?? "";
    const nextDay =
      initial?.dayOfWeek === null || initial?.dayOfWeek === undefined
        ? "none"
        : String(initial.dayOfWeek);
    const nextEx = initial ? [...initial.exercises] : [];
    setName(nextName);
    setDay(nextDay);
    setExercises(nextEx);
    initialSnapshotRef.current = JSON.stringify({
      name: nextName,
      day: nextDay,
      ex: nextEx,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function snapshotCurrent(): string {
    return JSON.stringify({ name, day, ex: exercises });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      const dirty = snapshotCurrent() !== initialSnapshotRef.current;
      if (dirty) {
        const ok = confirm(
          "Tienes cambios sin guardar en esta rutina. ¿Cerrar igualmente?",
        );
        if (!ok) return;
      }
    }
    onOpenChange(nextOpen);
  }

  function handleSave() {
    if (!name.trim() || exercises.length === 0) return;
    onSave({
      name: name.trim(),
      dayOfWeek: day === "none" ? null : parseInt(day, 10),
      exercises,
    });
    onOpenChange(false);
  }

  // ── Exercise-level helpers ─────────────────────────────────────────────
  function openNewEx() {
    setEditingExIndex(null);
    setExDialogOpen(true);
  }
  function openEditEx(i: number) {
    setEditingExIndex(i);
    setExDialogOpen(true);
  }
  function handleExerciseSave(exercise: RoutineExercise) {
    if (editingExIndex !== null) {
      const next = [...exercises];
      next[editingExIndex] = exercise;
      setExercises(next);
    } else {
      setExercises([...exercises, exercise]);
    }
  }
  function removeEx(i: number) {
    setExercises(exercises.filter((_, idx) => idx !== i));
  }
  function moveEx(i: number, dir: -1 | 1) {
    if (i + dir < 0 || i + dir >= exercises.length) return;
    const next = [...exercises];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setExercises(next);
  }
  function toggleSuperset(i: number) {
    if (i >= exercises.length - 1) return;
    const next = [...exercises];
    const cur = next[i].supersetId;
    const nxt = next[i + 1].supersetId;
    if (cur && cur === nxt) {
      next[i + 1] = { ...next[i + 1], supersetId: undefined };
    } else {
      const id = cur || nxt || generateId();
      next[i] = { ...next[i], supersetId: id };
      next[i + 1] = { ...next[i + 1], supersetId: id };
    }
    setExercises(next);
  }

  const effectiveTitle =
    title ?? (initial ? "Editar Rutina" : "Nueva Rutina");
  const effectiveSaveLabel =
    saveLabel ?? (initial ? "Guardar Cambios" : "Crear Rutina");

  const dayOptions = allowNoDay
    ? DAY_OPTIONS_WITH_NONE
    : DAY_OPTIONS_WITHOUT_NONE;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-auto rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-xl">{effectiveTitle}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 py-2">
            <div>
              <Label htmlFor="routine-name" className="text-sm font-medium">
                Nombre de la rutina
              </Label>
              <Input
                id="routine-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Push Day, Piernas..."
                className="mt-1.5 h-11"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Día de la semana</Label>
              <Select value={day} onValueChange={setDay}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue placeholder="Seleccionar día" />
                </SelectTrigger>
                <SelectContent>
                  {dayOptions.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exercises list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Ejercicios</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 rounded-lg"
                  onClick={openNewEx}
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
                      !!ex.supersetId &&
                      ex.supersetId === exercises[i + 1].supersetId;

                    return (
                      <div key={ex.id} className="relative">
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-xl border p-3 transition-colors",
                            ex.supersetId
                              ? "bg-primary/5 border-primary/30"
                              : "bg-card border-border",
                          )}
                        >
                          <div className="flex flex-col items-center justify-center shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/60 p-0"
                              onClick={() => moveEx(i, -1)}
                              disabled={i === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground/60 p-0"
                              onClick={() => moveEx(i, 1)}
                              disabled={i === exercises.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                          <button
                            className="flex flex-1 flex-col text-left min-w-0 px-2"
                            onClick={() => openEditEx(i)}
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
                            onClick={() => removeEx(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {i < exercises.length - 1 && (
                          <div className="flex justify-center -my-2 relative z-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-7 w-7 rounded-full border-2 bg-background shadow-sm transition-colors",
                                isLinkedToNext
                                  ? "text-primary border-primary bg-primary/10 hover:bg-primary/20"
                                  : "text-muted-foreground/40 border-border hover:text-foreground",
                              )}
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
              onClick={handleSave}
              disabled={!name.trim() || exercises.length === 0}
              className="w-full rounded-xl py-6 text-lg font-semibold"
              size="lg"
            >
              {effectiveSaveLabel}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ExerciseFormDialog
        open={exDialogOpen}
        onOpenChange={setExDialogOpen}
        initial={
          editingExIndex !== null ? exercises[editingExIndex] ?? null : null
        }
        onSave={handleExerciseSave}
        nameSuggestions={exerciseSuggestions}
        restPresets={useRestPresets ? DEFAULT_REST_PRESETS : undefined}
      />
    </>
  );
}

