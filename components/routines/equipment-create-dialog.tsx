"use client";

import { useState, useRef } from "react";
import {
  db,
  type Equipment,
  type EquipmentType,
  type MovementKind,
} from "@/lib/db";
import { EQUIPMENT_TYPE_LABELS } from "@/lib/equipment-catalog";
import {
  Dialog,
  DialogContent,
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
import { toast } from "sonner";
import { cn, logError } from "@/lib/utils";
import { Camera, X } from "lucide-react";

interface EquipmentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (equipment: Equipment) => void;
}

const MUSCLE_OPTIONS = [
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

const TYPE_OPTIONS: { value: EquipmentType; label: string; hint: string }[] = [
  { value: "barbell", label: EQUIPMENT_TYPE_LABELS.barbell, hint: "Barra olímpica + discos" },
  { value: "dumbbell", label: EQUIPMENT_TYPE_LABELS.dumbbell, hint: "Mancuernas fijas o ajustables" },
  { value: "machine_stack", label: EQUIPMENT_TYPE_LABELS.machine_stack, hint: "Máquina con stack de placas" },
  { value: "machine_stack_fine", label: EQUIPMENT_TYPE_LABELS.machine_stack_fine, hint: "Máquina con steps finos (2.5 kg)" },
  { value: "plate_loaded", label: EQUIPMENT_TYPE_LABELS.plate_loaded, hint: "Máquina cargada con discos" },
  { value: "cable", label: EQUIPMENT_TYPE_LABELS.cable, hint: "Polea / torre de cables" },
  { value: "smith", label: EQUIPMENT_TYPE_LABELS.smith, hint: "Máquina Smith" },
  { value: "bodyweight", label: EQUIPMENT_TYPE_LABELS.bodyweight, hint: "Sin carga externa" },
  { value: "custom", label: EQUIPMENT_TYPE_LABELS.custom, hint: "Otro — kettlebell, banda, etc." },
];

export function EquipmentCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: EquipmentCreateDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<EquipmentType>("machine_stack");
  const [movement, setMovement] = useState<MovementKind>("isolation");
  const [selectedMuscles, setSelectedMuscles] = useState<Set<string>>(new Set());
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [minWeight, setMinWeight] = useState("0");
  const [maxWeight, setMaxWeight] = useState("");
  const [increment, setIncrement] = useState("2.5");
  const [microIncrement, setMicroIncrement] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setType("machine_stack");
    setMovement("isolation");
    setSelectedMuscles(new Set());
    setUnit("kg");
    setMinWeight("0");
    setMaxWeight("");
    setIncrement("2.5");
    setMicroIncrement("");
    setPhoto(undefined);
  }

  function toggleMuscle(m: string) {
    const next = new Set(selectedMuscles);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    setSelectedMuscles(next);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error("La foto es muy pesada. Usa una de máximo 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.onerror = () => toast.error("No se pudo leer la foto.");
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Dale un nombre al equipo.");
      return;
    }
    if (selectedMuscles.size === 0) {
      toast.error("Selecciona al menos un grupo muscular.");
      return;
    }
    const incNum = parseFloat(increment.replace(",", "."));
    if (!isFinite(incNum) || incNum <= 0) {
      toast.error("El incremento debe ser un número positivo.");
      return;
    }
    const microNum = microIncrement.trim() === ""
      ? undefined
      : parseFloat(microIncrement.replace(",", "."));
    if (microNum !== undefined && (!isFinite(microNum) || microNum <= 0)) {
      toast.error("El micro-incremento debe ser positivo o quedar vacío.");
      return;
    }
    const minNum = parseFloat(minWeight.replace(",", ".")) || 0;
    const maxNum = maxWeight.trim() === ""
      ? null
      : parseFloat(maxWeight.replace(",", "."));
    if (maxNum !== null && !isFinite(maxNum)) {
      toast.error("El peso máximo no es un número válido.");
      return;
    }
    if (maxNum !== null && maxNum < minNum) {
      toast.error("El peso máximo no puede ser menor que el mínimo.");
      return;
    }

    setSaving(true);
    try {
      const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const eq: Equipment = {
        id,
        name: name.trim(),
        type,
        muscleGroups: Array.from(selectedMuscles),
        movement,
        minWeight: minNum,
        maxWeight: maxNum,
        increment: incNum,
        microIncrement: microNum,
        unit,
        photo,
        isCustom: true,
        createdAt: new Date(),
      };
      await db.customEquipment.add(eq);
      toast.success("Equipo creado.");
      reset();
      onCreated(eq);
    } catch (err) {
      logError(err);
      toast.error("No se pudo guardar el equipo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md w-[calc(100%-1.5rem)] rounded-xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear equipo personalizado</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-1">
          {/* Name */}
          <div>
            <Label className="text-sm font-medium">Nombre</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Press pecho con cadenas"
              className="mt-1 h-11"
              autoFocus
            />
          </div>

          {/* Type */}
          <div>
            <Label className="text-sm font-medium">Tipo de equipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as EquipmentType)}>
              <SelectTrigger className="mt-1 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex flex-col">
                      <span>{t.label}</span>
                      <span className="text-[10px] opacity-60">{t.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Muscles */}
          <div>
            <Label className="text-sm font-medium">Músculos trabajados</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MUSCLE_OPTIONS.map((m) => {
                const active = selectedMuscles.has(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMuscle(m)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Movement */}
          <div>
            <Label className="text-sm font-medium">Movimiento</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant={movement === "compound" ? "default" : "outline"}
                onClick={() => setMovement("compound")}
                className="h-11 rounded-lg"
                type="button"
              >
                Compuesto
              </Button>
              <Button
                variant={movement === "isolation" ? "default" : "outline"}
                onClick={() => setMovement("isolation")}
                className="h-11 rounded-lg"
                type="button"
              >
                Aislamiento
              </Button>
            </div>
          </div>

          {/* Unit + weight range */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Unidad</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as "kg" | "lb")}>
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="lb">lb</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Peso mín.</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={minWeight}
                onChange={(e) => setMinWeight(e.target.value)}
                className="mt-1 h-11"
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Peso máx.</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={maxWeight}
                onChange={(e) => setMaxWeight(e.target.value)}
                className="mt-1 h-11"
                placeholder="—"
              />
            </div>
          </div>

          {/* Increments */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">
                Incremento mínimo
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={increment}
                onChange={(e) => setIncrement(e.target.value)}
                className="mt-1 h-11"
                placeholder="2.5"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Paso estándar (ej: 5 kg en stack, 2.5 kg en barra)
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Micro-incremento
              </Label>
              <Input
                type="text"
                inputMode="decimal"
                value={microIncrement}
                onChange={(e) => setMicroIncrement(e.target.value)}
                className="mt-1 h-11"
                placeholder="opcional"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Add-on (ej: microplates 1.25 kg)
              </p>
            </div>
          </div>

          {/* Photo */}
          <div>
            <Label className="text-sm font-medium">Foto (opcional)</Label>
            <div className="mt-1.5 flex items-center gap-3">
              {photo ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo}
                    alt="Equipo"
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setPhoto(undefined)}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    aria-label="Quitar foto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  type="button"
                  className="h-16 w-16 p-0 flex-col gap-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-[9px]">Subir</span>
                </Button>
              )}
              <p className="text-[11px] text-muted-foreground flex-1">
                Se guarda localmente con tu equipo. Máx 1 MB.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Foto del equipo"
                onChange={handlePhotoChange}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-11"
          >
            {saving ? "Guardando..." : "Crear equipo"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => { reset(); onOpenChange(false); }}
            disabled={saving}
            className="w-full h-11"
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
