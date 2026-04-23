/**
 * Plausibility checks for set inputs — catches accidental typos ("13"
 * → "130", "12" → "1200") without blocking legitimate PRs.
 *
 * Philosophy: warn, don't block. A lifter can legitimately jump 50 kg on
 * a new exercise the first time they try it; they just need to confirm
 * they meant it. The thresholds below are tuned so real progressions
 * never trigger but 10× typos always do.
 */

export interface SanityContext {
  /** Routine-defined target reps (e.g. "8-12", "10", "AMRAP"). */
  targetReps?: string | number;
  /** Max weight from the user's last completed session of this exercise. */
  lastWeight?: number;
  /** Routine baseline weight (ex.targetWeight). Useful on first session. */
  baseWeight?: number;
  /** Equipment cap from the catalog, if the exercise has equipment assigned. */
  maxEquipmentWeight?: number | null;
  /** Weight unit — used verbatim in warning messages. */
  unit: string;
}

export interface SanityWarning {
  field: "weight" | "reps";
  message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RepBounds {
  min: number;
  max: number;
}

/** Parse "8-12", "10", or "AMRAP" into a min/max bound, or null if unknown. */
function parseRepTargetBounds(target: unknown): RepBounds | null {
  if (target === undefined || target === null) return null;
  const str = String(target).trim().toLowerCase();
  if (str === "amrap" || str === "max") return { min: 8, max: 30 };

  const range = str.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    if (isFinite(min) && isFinite(max) && min > 0 && max >= min) {
      return { min, max };
    }
  }
  const single = parseInt(str, 10);
  if (!isNaN(single) && single > 0) return { min: single, max: single };
  return null;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────
// Tuned for hypertrophy/strength lifting. A 2.5× baseline jump means e.g.
// 30 kg → 75 kg, which on the same exercise in the same session is almost
// certainly a typo. Real PRs progress in single-digit percentages per session.

const REPS_HIGH_OUTLIER = 60;        // > this = absurd reps absolute cap
const REPS_HIGH_VS_TARGET = 2.5;     // > target.max × this = typo
const REPS_LOW_VS_TARGET = 0.3;      // < target.min × this = suspicious (if target min > 3)
const REPS_NO_TARGET_CAP = 40;       // no routine target → warn above this
const WEIGHT_VS_BASELINE = 2.5;      // > baseline × this = typo
const WEIGHT_ABSOLUTE_CAP_KG = 500;  // > this = absurd regardless of context
const WEIGHT_ABSOLUTE_CAP_LB = 1100; // lb equivalent

// ─── Main check ───────────────────────────────────────────────────────────────

/**
 * Check a set's weight + reps against plausibility heuristics. Returns one
 * warning per triggered rule, so the UI can list them all in a single
 * confirm dialog. An empty array means "looks normal, proceed silently".
 */
export function checkSetSanity(
  weight: number,
  reps: number,
  context: SanityContext,
): SanityWarning[] {
  const out: SanityWarning[] = [];
  const { unit } = context;

  // ── Reps ──────────────────────────────────────────────────────────────
  const bounds = parseRepTargetBounds(context.targetReps);

  // Absolute cap — hypertrophy top-end is ~30 reps; anything over 60 is
  // almost always a keypad typo.
  if (reps > REPS_HIGH_OUTLIER) {
    out.push({
      field: "reps",
      message: `Anotaste ${reps} reps. Es un número muy alto para cualquier serie normal. ¿Querés confirmar?`,
    });
  } else if (bounds) {
    if (reps > bounds.max * REPS_HIGH_VS_TARGET) {
      out.push({
        field: "reps",
        message: `${reps} reps es muy por encima del rango objetivo (${bounds.min === bounds.max ? bounds.min : `${bounds.min}–${bounds.max}`}). ¿Es un error de tipeo?`,
      });
    }
    // Only warn on "too low" if the target minimum is big enough that
    // falling well below it clearly indicates a typo, not a hard failure.
    if (
      reps > 0 &&
      bounds.min > 3 &&
      reps < bounds.min * REPS_LOW_VS_TARGET
    ) {
      out.push({
        field: "reps",
        message: `${reps} reps es mucho menos que el rango objetivo (${bounds.min}–${bounds.max}). Si llegaste al fallo pronto confirma; si no, puede ser un tipeo.`,
      });
    }
  } else if (reps > REPS_NO_TARGET_CAP) {
    out.push({
      field: "reps",
      message: `${reps} reps es inusualmente alto. ¿Estás seguro?`,
    });
  }

  // ── Weight ────────────────────────────────────────────────────────────
  if (weight > 0) {
    const unitLower = unit.toLowerCase();
    const absoluteCap =
      unitLower === "lb" || unitLower === "lbs"
        ? WEIGHT_ABSOLUTE_CAP_LB
        : WEIGHT_ABSOLUTE_CAP_KG;

    if (weight > absoluteCap) {
      out.push({
        field: "weight",
        message: `${weight} ${unit} supera lo que un humano levanta en una serie normal. ¿Confirma que no es un typo?`,
      });
    }

    const baseline = Math.max(
      context.lastWeight ?? 0,
      context.baseWeight ?? 0,
    );
    if (baseline > 0 && weight > baseline * WEIGHT_VS_BASELINE) {
      const ref =
        context.lastWeight && context.lastWeight > 0
          ? `último registro: ${context.lastWeight} ${unit}`
          : `peso base: ${baseline} ${unit}`;
      out.push({
        field: "weight",
        message: `${weight} ${unit} es más del doble y medio de tu ${ref}. ¿Fue un salto real o un tipeo?`,
      });
    }

    if (
      context.maxEquipmentWeight != null &&
      context.maxEquipmentWeight > 0 &&
      weight > context.maxEquipmentWeight
    ) {
      out.push({
        field: "weight",
        message: `${weight} ${unit} supera el máximo de este equipo según el catálogo (${context.maxEquipmentWeight} ${unit}). ¿Seguro?`,
      });
    }
  }

  return out;
}
