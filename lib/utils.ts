import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Days of week ────────────────────────────────────────────────────────────

/**
 * Canonical Spanish day names (no accents). Index matches JavaScript's
 * Date.getDay(): 0 = Sunday, 1 = Monday, etc.
 */
export const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
] as const;

/** Ordered day-select options, plus the `"none"` entry for unassigned routines. */
export const DAY_SELECT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "none", label: "Sin asignar" },
  { value: "0", label: "Domingo" },
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miercoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sabado" },
];

// ─── Parsing helpers ─────────────────────────────────────────────────────────

/**
 * Parse a possibly-string numeric value. Accepts comma as decimal separator
 * ("17,5" → 17.5), empty string → default, and invalid input → default.
 * Rejects scientific notation to avoid surprises (`"1e10"` stays rejected).
 */
export function parseNumber(
  value: string | number,
  defaultValue: number,
): number {
  if (typeof value === "number") return value;
  const trimmed = value.trim();
  if (trimmed === "") return defaultValue;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed.replace(",", "."))) return defaultValue;
  const parsed = parseFloat(trimmed.replace(",", "."));
  return isNaN(parsed) ? defaultValue : parsed;
}

// ─── ID generation ───────────────────────────────────────────────────────────

/** Short random id suitable for client-side exercise/superset ids. */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ─── Duration formatting ─────────────────────────────────────────────────────

/** Format seconds as `H:MM:SS` (dropping hours if 0). */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
