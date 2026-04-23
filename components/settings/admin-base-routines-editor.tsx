"use client";

import { useEffect, useState } from "react";
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
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  Save,
  RefreshCw,
  Loader2,
  Shield,
  CloudOff,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { DAY_NAMES as DAYS } from "@/lib/utils";
import {
  RoutineEditorSheet,
  type RoutineDraft,
} from "@/components/routines/routine-editor-sheet";

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

  // Routine editor — state owned by <RoutineEditorSheet>. We only track
  // which index is being edited (null = new) to know where to apply the
  // save callback.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitial, setSheetInitial] = useState<RoutineDraft | null>(null);

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
    setSheetInitial(null);
    setSheetOpen(true);
  }
  function openEditRoutine(i: number) {
    const r = routines[i];
    setEditingIndex(i);
    setSheetInitial({
      name: r.name,
      dayOfWeek: r.dayOfWeek,
      exercises: r.exercises,
    });
    setSheetOpen(true);
  }
  function removeRoutine(i: number) {
    if (!confirm(`¿Eliminar rutina "${routines[i].name}"?`)) return;
    setRoutines(routines.filter((_, idx) => idx !== i));
    setDirty(true);
  }
  function handleRoutineSave(draft: RoutineDraft) {
    const payload: BaseRoutineTemplate = {
      name: draft.name,
      dayOfWeek: draft.dayOfWeek,
      exercises: draft.exercises,
    };
    if (editingIndex !== null) {
      const next = [...routines];
      next[editingIndex] = payload;
      setRoutines(next);
    } else {
      setRoutines([...routines, payload]);
    }
    setDirty(true);
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

      {/* Routine editor — shared sheet. Admin uses free-form rest input
          (useRestPresets=false) since any value can be relevant here. */}
      <RoutineEditorSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initial={sheetInitial}
        onSave={handleRoutineSave}
        useRestPresets={false}
        saveLabel={editingIndex !== null ? "Aplicar cambios" : "Agregar rutina"}
        title={editingIndex !== null ? "Editar rutina base" : "Nueva rutina base"}
      />
    </div>
  );
}
