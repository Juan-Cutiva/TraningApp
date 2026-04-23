"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { adminHeaders } from "@/lib/auth";
import {
  fetchBaseRoutines,
  saveBaseRoutines,
  resetBaseRoutines,
  type BaseRoutineTemplate,
} from "@/lib/base-routines-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Save,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Link2,
  Loader2,
  Shield,
  CloudOff,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  cn,
  DAY_NAMES as DAYS,
  DAY_SELECT_OPTIONS as DAY_OPTIONS,
  generateId,
} from "@/lib/utils";
import type { RoutineExercise } from "@/lib/db";
import { ExerciseFormDialog } from "@/components/routines/exercise-form-dialog";

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminBaseRoutinesEditor() {
  const { isAdmin } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<string>("bundled");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);

  const [routines, setRoutines] = useState<BaseRoutineTemplate[]>([]);
  const [dirty, setDirty] = useState(false);

  // Routine editor
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rName, setRName] = useState("");
  const [rDay, setRDay] = useState<string>("none");
  const [rExercises, setRExercises] = useState<RoutineExercise[]>([]);
  const sheetInitialSnapshotRef = useRef<string>("");
  function snapshotCurrent(): string {
    return JSON.stringify({ name: rName, day: rDay, ex: rExercises });
  }
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

  // Exercise dialog (inside routine editor) — form state lives inside the
  // shared <ExerciseFormDialog>; we only need the index being edited.
  const [exDialogOpen, setExDialogOpen] = useState(false);
  const [editingExIndex, setEditingExIndex] = useState<number | null>(null);

  // ── Initial load ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchBaseRoutines();
      if (cancelled) return;
      setRoutines(data.routines);
      setSource(data.source);
      setUpdatedAt(data.updatedAt ?? null);
      setUpdatedBy(data.updatedBy ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Routine-level ops ───────────────────────────────────────────────────
  function openNewRoutine() {
    setEditingIndex(null);
    setRName("");
    setRDay("none");
    setRExercises([]);
    sheetInitialSnapshotRef.current = JSON.stringify({
      name: "",
      day: "none",
      ex: [],
    });
    setSheetOpen(true);
  }
  function openEditRoutine(i: number) {
    const r = routines[i];
    const day = r.dayOfWeek === null ? "none" : String(r.dayOfWeek);
    const ex = [...r.exercises];
    setEditingIndex(i);
    setRName(r.name);
    setRDay(day);
    setRExercises(ex);
    sheetInitialSnapshotRef.current = JSON.stringify({
      name: r.name,
      day,
      ex,
    });
    setSheetOpen(true);
  }
  function removeRoutine(i: number) {
    if (!confirm(`¿Eliminar rutina "${routines[i].name}"?`)) return;
    setRoutines(routines.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function saveRoutine() {
    if (!rName.trim()) {
      toast.error("La rutina necesita un nombre.");
      return;
    }
    const payload: BaseRoutineTemplate = {
      name: rName.trim(),
      dayOfWeek: rDay === "none" ? null : parseInt(rDay, 10),
      exercises: rExercises,
    };
    if (editingIndex !== null) {
      const next = [...routines];
      next[editingIndex] = payload;
      setRoutines(next);
    } else {
      setRoutines([...routines, payload]);
    }
    setSheetOpen(false);
    setDirty(true);
  }

  // ── Exercise-level ops ──────────────────────────────────────────────────
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
      const arr = [...rExercises];
      arr[editingExIndex] = exercise;
      setRExercises(arr);
    } else {
      setRExercises([...rExercises, exercise]);
    }
  }
  function removeEx(i: number) {
    setRExercises(rExercises.filter((_, idx) => idx !== i));
  }
  function moveEx(i: number, dir: -1 | 1) {
    if (i + dir < 0 || i + dir >= rExercises.length) return;
    const next = [...rExercises];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setRExercises(next);
  }
  function toggleSuperset(i: number) {
    if (i >= rExercises.length - 1) return;
    const next = [...rExercises];
    const cur = next[i].supersetId;
    const nxt = next[i + 1].supersetId;
    if (cur && cur === nxt) {
      next[i + 1] = { ...next[i + 1], supersetId: undefined };
    } else {
      const id = cur || nxt || generateId();
      next[i] = { ...next[i], supersetId: id };
      next[i + 1] = { ...next[i + 1], supersetId: id };
    }
    setRExercises(next);
  }

  // ── Persistence ─────────────────────────────────────────────────────────
  async function handleSaveAll() {
    setSaving(true);
    const res = await saveBaseRoutines(routines, adminHeaders());
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudieron guardar las rutinas", {
        description: res.error,
      });
      return;
    }
    toast.success("Rutinas base actualizadas para todos los usuarios.");
    setDirty(false);
    // Re-fetch to pick up server timestamp
    const data = await fetchBaseRoutines();
    setSource(data.source);
    setUpdatedAt(data.updatedAt ?? null);
    setUpdatedBy(data.updatedBy ?? null);
  }

  async function handleReset() {
    if (
      !confirm(
        "Esto eliminará la versión editada del servidor y volverá a las rutinas base del código. Los usuarios verán las del código hasta que guardes una nueva. ¿Continuar?",
      )
    ) {
      return;
    }
    setSaving(true);
    const res = await resetBaseRoutines(adminHeaders());
    setSaving(false);
    if (!res.ok) {
      toast.error("No se pudo restablecer", { description: res.error });
      return;
    }
    toast.success("Rutinas base restablecidas al código.");
    const data = await fetchBaseRoutines();
    setRoutines(data.routines);
    setSource(data.source);
    setUpdatedAt(data.updatedAt ?? null);
    setUpdatedBy(data.updatedBy ?? null);
    setDirty(false);
  }

  // ── Non-admin guard (UX only; server also enforces) ────────────────────
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-10 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
        <h1 className="text-xl font-bold text-foreground">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Esta pantalla es solo para administradores.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={() => router.push("/settings")}
        >
          Volver a Ajustes
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">
            Rutinas base
          </h1>
          <p className="text-xs text-muted-foreground">
            Plantilla que cargan todos los usuarios desde Ajustes.
          </p>
        </div>
      </div>

      {/* Source banner */}
      <Card className="mb-4 border-border/60">
        <CardContent className="p-3 flex items-center gap-3">
          {source === "database" ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-green-400 uppercase tracking-wide">
                  Servidor
                </p>
                <p className="text-sm text-foreground">
                  Versión guardada en la base de datos
                </p>
                {updatedAt && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Actualizado {new Date(updatedAt).toLocaleString("es")}
                    {updatedBy ? ` por ${updatedBy}` : ""}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <CloudOff className="h-5 w-5 text-yellow-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-yellow-500 uppercase tracking-wide">
                  Código
                </p>
                <p className="text-sm text-foreground">
                  Todavía no hay versión editada en el servidor — se muestran
                  las rutinas del código.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Action bar */}
      <div className="flex items-center gap-2 mb-5">
        <Button
          onClick={handleSaveAll}
          disabled={!dirty || saving}
          className="flex-1 gap-2"
        >
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : dirty ? "Guardar cambios" : "Sin cambios"}
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={saving || source !== "database"}
          title={
            source !== "database"
              ? "No hay nada en el servidor para restablecer"
              : "Borra la versión del servidor y vuelve al código"
          }
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Routines list */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {routines.length} rutina{routines.length === 1 ? "" : "s"}
        </h2>
        <Button size="sm" variant="outline" onClick={openNewRoutine} className="gap-1">
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {routines.map((r, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.dayOfWeek === null ? "Sin día" : DAYS[r.dayOfWeek]} ·{" "}
                  {r.exercises.length} ejercicios
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEditRoutine(i)}
                aria-label={`Editar ${r.name}`}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeRoutine(i)}
                aria-label={`Eliminar ${r.name}`}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {routines.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <p>No hay rutinas.</p>
              <p className="text-xs mt-1">Tocá "Agregar" para crear una.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Routine edit sheet */}
      <Sheet open={sheetOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent side="bottom" className="max-h-[92dvh] overflow-auto rounded-t-2xl">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle>
              {editingIndex !== null ? "Editar rutina base" : "Nueva rutina base"}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 py-2">
            <div>
              <Label className="text-sm font-medium">Nombre</Label>
              <Input
                value={rName}
                onChange={(e) => setRName(e.target.value)}
                placeholder="Ej: Lunes - Torso"
                className="mt-1 h-11"
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Día de la semana</Label>
              <Select value={rDay} onValueChange={setRDay}>
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-base font-semibold">Ejercicios</Label>
                <Button size="sm" variant="outline" onClick={openNewEx} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  Agregar
                </Button>
              </div>

              {rExercises.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Sin ejercicios aún.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rExercises.map((ex, i) => {
                    const isLinked =
                      i < rExercises.length - 1 &&
                      ex.supersetId &&
                      ex.supersetId === rExercises[i + 1].supersetId;
                    return (
                      <div key={ex.id} className="relative">
                        <div
                          className={cn(
                            "flex items-center gap-2 rounded-xl border p-2.5",
                            ex.supersetId
                              ? "bg-primary/5 border-primary/30"
                              : "bg-card border-border",
                          )}
                        >
                          <div className="flex flex-col shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveEx(i, -1)}
                              disabled={i === 0}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => moveEx(i, 1)}
                              disabled={i === rExercises.length - 1}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <button
                            className="flex-1 text-left min-w-0"
                            onClick={() => openEditEx(i)}
                          >
                            <p className="text-sm font-semibold truncate flex items-center gap-2">
                              {ex.name}
                              {ex.supersetId && (
                                <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                  SS
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ex.muscleGroup} · {ex.sets}×{ex.reps}
                              {ex.equipmentId && " · eq"}
                            </p>
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
                        {i < rExercises.length - 1 && (
                          <div className="flex justify-center -my-1 relative z-10">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleSuperset(i)}
                              className={cn(
                                "h-6 w-6 rounded-full border-2 bg-background",
                                isLinked
                                  ? "text-primary border-primary bg-primary/10"
                                  : "text-muted-foreground/40 border-border",
                              )}
                              title="Vincular como super serie"
                            >
                              <Link2 className="h-3 w-3" />
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
            <Button onClick={saveRoutine} className="w-full rounded-xl py-5 font-semibold">
              {editingIndex !== null ? "Aplicar cambios" : "Agregar rutina"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Exercise dialog — shared component (free-form rest input for admin). */}
      <ExerciseFormDialog
        open={exDialogOpen}
        onOpenChange={setExDialogOpen}
        initial={
          editingExIndex !== null ? rExercises[editingExIndex] ?? null : null
        }
        onSave={handleExerciseSave}
      />
    </div>
  );
}
