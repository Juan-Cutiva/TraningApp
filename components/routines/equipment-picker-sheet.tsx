"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Equipment } from "@/lib/db";
import {
  EQUIPMENT_CATALOG,
  CATALOG_MUSCLE_GROUPS,
  EQUIPMENT_TYPE_LABELS,
} from "@/lib/equipment-catalog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  X,
  Plus,
  Dumbbell as DumbbellIcon,
  Settings as SettingsIcon,
  Activity as ActivityIcon,
  Cable as CableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EquipmentCreateDialog } from "./equipment-create-dialog";

interface EquipmentPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user picks an equipment. Receives the full object so the
   *  caller can auto-fill name, muscle group, unit, and targetWeight. */
  onSelect: (equipment: Equipment) => void;
  /** Currently selected equipment id, highlighted in the list. */
  currentEquipmentId?: string;
}

function EquipmentIcon({ icon }: { icon?: string }) {
  const common = "h-5 w-5";
  if (icon === "cable") return <CableIcon className={common} aria-hidden="true" />;
  if (icon === "settings") return <SettingsIcon className={common} aria-hidden="true" />;
  if (icon === "activity") return <ActivityIcon className={common} aria-hidden="true" />;
  return <DumbbellIcon className={common} aria-hidden="true" />;
}

export function EquipmentPickerSheet({
  open,
  onOpenChange,
  onSelect,
  currentEquipmentId,
}: EquipmentPickerSheetProps) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const customEquipment = useLiveQuery(() => db.customEquipment.toArray(), []);

  const allEquipment = useMemo<Equipment[]>(() => {
    return [...(customEquipment ?? []), ...EQUIPMENT_CATALOG];
  }, [customEquipment]);

  const allMuscles = useMemo(() => {
    const s = new Set<string>(CATALOG_MUSCLE_GROUPS);
    customEquipment?.forEach((e) => e.muscleGroups.forEach((m) => s.add(m)));
    return Array.from(s).sort();
  }, [customEquipment]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEquipment.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (muscleFilter && !e.muscleGroups.includes(muscleFilter)) return false;
      if (typeFilter && e.type !== typeFilter) return false;
      return true;
    });
  }, [allEquipment, search, muscleFilter, typeFilter]);

  function handleSelect(eq: Equipment) {
    onSelect(eq);
    onOpenChange(false);
    // Reset state so next open is clean
    setSearch("");
    setMuscleFilter(null);
    setTypeFilter(null);
  }

  const typeFilters: { value: string; label: string }[] = [
    { value: "barbell", label: EQUIPMENT_TYPE_LABELS.barbell },
    { value: "dumbbell", label: EQUIPMENT_TYPE_LABELS.dumbbell },
    { value: "machine_stack", label: "Stack" },
    { value: "plate_loaded", label: "Plate-loaded" },
    { value: "cable", label: EQUIPMENT_TYPE_LABELS.cable },
    { value: "smith", label: "Smith" },
    { value: "bodyweight", label: "Peso corporal" },
    { value: "custom", label: "Personalizado" },
  ];

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="h-[92dvh] p-0 flex flex-col rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="text-xl">Seleccionar equipo</SheetTitle>
            </div>
          </SheetHeader>

          {/* Search + Create */}
          <div className="px-4 pt-3 pb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ejercicio o máquina..."
                className="pl-9 h-11"
                aria-label="Buscar equipo"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
              className="gap-1 h-11 shrink-0 border-primary/40 text-primary"
            >
              <Plus className="h-4 w-4" />
              Crear
            </Button>
          </div>

          {/* Muscle filter chips */}
          <div className="px-4 pb-1 overflow-x-auto">
            <div className="flex gap-1.5 pb-1.5 min-w-max">
              <Chip
                active={muscleFilter === null}
                onClick={() => setMuscleFilter(null)}
              >
                Todos los músculos
              </Chip>
              {allMuscles.map((m) => (
                <Chip
                  key={m}
                  active={muscleFilter === m}
                  onClick={() => setMuscleFilter(muscleFilter === m ? null : m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>

          {/* Type filter chips */}
          <div className="px-4 pb-2 overflow-x-auto">
            <div className="flex gap-1.5 pb-1.5 min-w-max">
              <Chip
                active={typeFilter === null}
                onClick={() => setTypeFilter(null)}
                variant="subtle"
              >
                Todos los tipos
              </Chip>
              {typeFilters.map((t) => (
                <Chip
                  key={t.value}
                  active={typeFilter === t.value}
                  onClick={() => setTypeFilter(typeFilter === t.value ? null : t.value)}
                  variant="subtle"
                >
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <p>No hay equipos que coincidan con los filtros.</p>
                <p className="mt-1 opacity-70">
                  Intenta ajustar la búsqueda o{" "}
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    crea uno personalizado
                  </button>
                  .
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 py-2">
                {filtered.map((eq) => {
                  const isSelected = eq.id === currentEquipmentId;
                  const microLabel = eq.microIncrement
                    ? ` (micro ${eq.microIncrement})`
                    : "";
                  return (
                    <button
                      key={eq.id}
                      type="button"
                      onClick={() => handleSelect(eq)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:bg-muted/50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          isSelected ? "bg-primary/20 text-primary" : "bg-muted text-foreground/80",
                        )}
                      >
                        {eq.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={eq.photo}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover"
                          />
                        ) : (
                          <EquipmentIcon icon={eq.icon} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">
                          {eq.name}
                          {eq.isCustom && (
                            <span className="ml-1.5 text-[9px] font-bold uppercase text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                              Propio
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {eq.muscleGroups.slice(0, 3).join(", ")}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {EQUIPMENT_TYPE_LABELS[eq.type] ?? eq.type} · paso{" "}
                          {eq.increment} {eq.unit}
                          {microLabel}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] font-bold text-primary shrink-0">
                          SELECCIONADO
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clear selection option */}
          {currentEquipmentId && (
            <div className="border-t border-border/50 px-4 py-3">
              <Button
                variant="ghost"
                className="w-full text-destructive gap-2"
                onClick={() => {
                  // Passing a sentinel-ish empty equipment by clearing the field
                  // is handled by parent calling a separate clear action. Here
                  // we just close the sheet — parent should expose a Quitar button.
                  onOpenChange(false);
                }}
              >
                <X className="h-4 w-4" />
                Cerrar sin cambios
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <EquipmentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(eq) => {
          setCreateOpen(false);
          // Auto-select freshly created equipment
          handleSelect(eq);
        }}
      />
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
  variant = "primary",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "subtle";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? variant === "primary"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-foreground/90 text-background border-foreground/90"
          : "bg-card text-muted-foreground border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

