"use client";

import { useEffect, useRef, useState } from "react";
import {
  resolveEquipment,
  type Equipment,
  type RoutineExercise,
} from "@/lib/db";
import {
  EQUIPMENT_TYPE_LABELS,
  findCatalogEquipment,
} from "@/lib/equipment-catalog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ChevronRight, Trash2 } from "lucide-react";
import { cn, generateId, parseNumber } from "@/lib/utils";
import { EquipmentPickerSheet } from "./equipment-picker-sheet";

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

interface ExerciseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial exercise data. null = "new exercise" mode. */
  initial: RoutineExercise | null;
  /** Called with the finished exercise when the user taps save. */
  onSave: (exercise: RoutineExercise) => void;
  /** Optional autocomplete suggestions for the name input. */
  nameSuggestions?: string[];
  /**
   * Rest seconds presets for the Select dropdown. If omitted, a free-form
   * numeric Input is shown instead — useful for admin base-routines where
   * the admin may want any rest value.
   */
  restPresets?: readonly { value: string; label: string }[];
}

export function ExerciseFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  nameSuggestions,
  restPresets,
}: ExerciseFormDialogProps) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState("Pecho");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState<string | number>("10");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState("kg");
  const [rest, setRest] = useState("150");
  const [equipmentId, setEquipmentId] = useState<string | undefined>();
  const [equipmentPreview, setEquipmentPreview] = useState<Equipment | undefined>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const existingRef = useRef<RoutineExercise | null>(null);

  // Repopulate the form whenever the dialog opens with new initial data.
  useEffect(() => {
    if (!open) return;
    existingRef.current = initial;
    if (initial) {
      setName(initial.name);
      setMuscle(initial.muscleGroup);
      setSets(String(initial.sets));
      setReps(initial.reps);
      setWeight(initial.targetWeight === 0 ? "" : String(initial.targetWeight));
      setUnit(initial.unit || "kg");
      setRest(String(initial.restSeconds));
      setEquipmentId(initial.equipmentId);
      if (initial.equipmentId) {
        const fromCatalog = findCatalogEquipment(initial.equipmentId);
        if (fromCatalog) {
          setEquipmentPreview(fromCatalog);
        } else {
          resolveEquipment(initial.equipmentId).then(setEquipmentPreview);
        }
      } else {
        setEquipmentPreview(undefined);
      }
    } else {
      setName("");
      setMuscle("Pecho");
      setSets("3");
      setReps("10");
      setWeight("");
      setUnit("kg");
      setRest("150");
      setEquipmentId(undefined);
      setEquipmentPreview(undefined);
    }
  }, [open, initial]);

  function handleEquipmentSelected(eq: Equipment) {
    setEquipmentId(eq.id);
    setEquipmentPreview(eq);
    // Auto-fill obvious fields when not already populated, so selecting
    // "Press banca con barra" pre-fills name/muscle/unit.
    if (!name.trim()) setName(eq.name);
    if (eq.muscleGroups.length > 0) setMuscle(eq.muscleGroups[0]);
    setUnit(eq.unit);
  }

  function clearEquipment() {
    setEquipmentId(undefined);
    setEquipmentPreview(undefined);
  }

  function handleSave() {
    if (!name.trim()) return;
    const existing = existingRef.current;
    const payload: RoutineExercise = {
      id: existing?.id || generateId(),
      name: name.trim(),
      muscleGroup: muscle,
      sets: parseNumber(sets, 3),
      reps,
      targetWeight: parseNumber(weight, 0),
      unit,
      restSeconds: parseNumber(rest, 150),
      supersetId: existing?.supersetId,
      equipmentId,
    };
    onSave(payload);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md w-[calc(100%-1.5rem)] rounded-xl max-h-[88dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {initial ? "Editar ejercicio" : "Nuevo ejercicio"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {nameSuggestions && nameSuggestions.length > 0 && (
              <datalist id="exercise-name-suggestions">
                {nameSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            )}
            <div>
              <Label className="text-sm font-medium">Nombre del ejercicio</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Press banca, Sentadilla..."
                className="mt-1 h-11"
                list={nameSuggestions ? "exercise-name-suggestions" : undefined}
                autoComplete="off"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Grupo muscular</Label>
              <Select value={muscle} onValueChange={setMuscle}>
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

            {/* Equipment picker — tapping opens the full-screen sheet. Used
                by the RPE engine to respect real increments. */}
            <div>
              <Label className="text-sm font-medium">Equipo</Label>
              <div className="mt-1 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex-1 justify-between h-11 text-left font-normal",
                    !equipmentPreview && "text-muted-foreground",
                  )}
                  onClick={() => setPickerOpen(true)}
                >
                  <span className="truncate">
                    {equipmentPreview
                      ? equipmentPreview.name
                      : "Seleccionar equipo (opcional)"}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
                {equipmentPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearEquipment}
                    aria-label="Quitar equipo"
                    className="h-11 w-11 text-muted-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {equipmentPreview && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  {EQUIPMENT_TYPE_LABELS[equipmentPreview.type] ??
                    equipmentPreview.type}
                  {" · paso "}
                  {equipmentPreview.increment} {equipmentPreview.unit}
                  {equipmentPreview.microIncrement
                    ? ` (micro ${equipmentPreview.microIncrement})`
                    : ""}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Series</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={sets}
                  onChange={(e) => setSets(e.target.value)}
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
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  className="mt-1 h-11"
                  placeholder="10 o 8-12"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Peso objetivo
              </Label>
              <div className="flex mt-1 items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="h-11 flex-1 min-w-0"
                  placeholder="0 (opcional)"
                />
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="h-11 w-24 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="lb">lb</SelectItem>
                    <SelectItem value="otro">otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-1">
                Dejalo vacío si el peso dependerá de tu progreso — al entrenar
                se precarga con el peso de la última sesión.
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium">Descanso (segundos)</Label>
              {restPresets ? (
                <Select value={String(rest)} onValueChange={(v) => setRest(v)}>
                  <SelectTrigger className="mt-1 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {restPresets.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="text"
                  inputMode="numeric"
                  value={rest}
                  onChange={(e) => setRest(e.target.value)}
                  className="mt-1 h-11"
                  placeholder="150"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!name.trim()}
            >
              {initial ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EquipmentPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentEquipmentId={equipmentId}
        onSelect={handleEquipmentSelected}
      />
    </>
  );
}

/** Default rest presets matching the existing routines page Select. */
export const DEFAULT_REST_PRESETS = [
  { value: "10", label: "10s (10 seg)" },
  { value: "15", label: "15s (15 seg)" },
  { value: "30", label: "30s (30 seg)" },
  { value: "60", label: "60s (1 min)" },
  { value: "90", label: "90s (1.5 min)" },
  { value: "120", label: "120s (2 min)" },
  { value: "150", label: "150s (2.5 min)" },
  { value: "180", label: "180s (3 min)" },
  { value: "240", label: "240s (4 min)" },
] as const;
