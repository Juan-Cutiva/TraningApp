"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  estimateRoutineDuration,
  type Routine,
} from "@/lib/db";
import {
  RoutineEditorSheet,
  type RoutineDraft,
} from "./routine-editor-sheet";
import { findCatalogEquipment, EQUIPMENT_TYPE_LABELS } from "@/lib/equipment-catalog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart3,
  ChevronRight,
  Clock,
  Copy,
  Dumbbell,
  Edit2,
  History,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { DAY_NAMES as DAYS, generateId } from "@/lib/utils";

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

  // Routine sheet state — the sheet owns name/day/exercises internally.
  // We only need to track whether it's open + which routine it's editing
  // (null = new, `clone:<name>` preseed for duplicates).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [sheetInitial, setSheetInitial] = useState<{
    name: string;
    dayOfWeek: number | null;
    exercises: Routine["exercises"];
  } | null>(null);

  function openNewRoutine() {
    setEditingRoutine(null);
    setSheetInitial(null);
    setSheetOpen(true);
  }

  function openEditRoutine(routine: Routine) {
    setEditingRoutine(routine);
    setSheetInitial({
      name: routine.name,
      dayOfWeek: routine.dayOfWeek,
      exercises: routine.exercises,
    });
    setSheetOpen(true);
  }

  function cloneRoutine(routine: Routine) {
    setEditingRoutine(null);
    setSheetInitial({
      name: `Copia de ${routine.name}`,
      dayOfWeek: routine.dayOfWeek,
      exercises: routine.exercises.map((ex) => ({
        ...ex,
        id: generateId(),
      })),
    });
    setSheetOpen(true);
  }

  async function handleRoutineSave(draft: RoutineDraft) {
    const data = {
      name: draft.name,
      dayOfWeek: draft.dayOfWeek,
      exercises: draft.exercises,
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
  }

  async function handleDelete(id: number) {
    if (confirm("¿Eliminar esta rutina?")) {
      await db.routines.delete(id);
    }
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

      {/* Routine editor — self-contained shared component. Nested
          ExerciseFormDialog + EquipmentPickerSheet are mounted inside it. */}
      <RoutineEditorSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initial={sheetInitial}
        onSave={handleRoutineSave}
        exerciseSuggestions={exerciseSuggestions}
        saveLabel={editingRoutine ? "Guardar Cambios" : "Crear Rutina"}
        title={editingRoutine ? "Editar Rutina" : "Nueva Rutina"}
      />
    </div>
  );
}
