/**
 * RPE-based progression recommendation engine — v2
 *
 * Factors analysed:
 *  - Weighted RPE (last sets carry more weight — represent peak accumulated fatigue)
 *  - RPE fatigue trend across sets (escalation rate)
 *  - Actual reps performed vs target rep range (real completion quality)
 *  - Exercise category (compound / isolation / core / bodyweight)
 *  - Rep zone (strength 1-5 / hypertrophy 6-12 / endurance 13+)
 *  - Coverage ratio (won't recommend without sufficient RPE data)
 *  - Set count (more sets = higher accumulated fatigue = conservative adjustments)
 *  - Unit-aware increments (kg vs lbs, different for each zone and category)
 *  - Double progression model (reps first → weight second)
 */

export type RPEValue = "easy" | "normal" | "hard" | "failure";

export type RecommendationType =
  | "increase_weight_large"   // far too easy — jump
  | "increase_weight"         // ready to progress — standard increment
  | "increase_weight_small"   // borderline — micro increment
  | "maintain_increase_reps"  // same weight, build toward top of range
  | "maintain"                // perfect stimulus — repeat
  | "decrease_weight_small"   // slightly over-reached
  | "decrease_weight"         // too heavy for current level
  | "deload";                 // multiple failures — recovery needed

export interface SetAnalysis {
  weight: number;
  unit: string;
  /** Target reps string from routine: "10", "8-12", "AMRAP", etc. */
  reps: string | number;
  /** Undefined if user didn't rate this set */
  rpe?: RPEValue;
  completed: boolean;
}

export interface RPERecommendation {
  type: RecommendationType;
  weightDelta: number;
  repsDelta: number;
  headline: string;
  detail: string;
  color: "green" | "yellow" | "orange" | "red" | "blue";
  emoji: string;
}

// ─── RPE numeric mapping (RIR-based) ─────────────────────────────────────────
// easy ≈ 4 RIR, normal ≈ 2 RIR, hard ≈ 1 RIR, failure = 0 RIR
const RPE_NUMERIC: Record<RPEValue, number> = {
  easy:    5.5,
  normal:  7.5,
  hard:    9.0,
  failure: 10.0,
};

// ─── Exercise categorization ─────────────────────────────────────────────────
type ExerciseCategory = "compound" | "isolation" | "core";

const COMPOUND_MUSCLE_KEYWORDS = [
  "pecho", "espalda", "piernas", "glúteos", "gluteos",
  "cuádriceps", "cuadriceps", "isquiotibiales", "femoral",
  "hombros", "trapecio", "dorsales", "aductores", "abductores",
];

const ISOLATION_MUSCLE_KEYWORDS = [
  "bíceps", "biceps", "tríceps", "triceps",
  "antebrazo", "pantorrillas", "gemelos", "manguito", "rotador",
];

const CORE_MUSCLE_KEYWORDS = [
  "abdomen", "oblicuos", "lumbares", "core",
];

const COMPOUND_EXERCISE_PATTERNS = [
  /press/i, /sentadilla/i, /squat/i, /peso muerto/i, /deadlift/i,
  /remo/i, /\brow\b/i, /jalón/i, /jalon/i, /pulldown/i, /pull.?up/i,
  /dominada/i, /\bchin\b/i, /\bdip\b/i, /fondos/i, /hip thrust/i,
  /zancada/i, /lunge/i, /\bstep\b/i, /empuje/i, /tracción/i, /traccion/i,
  /overhead/i, /militar/i, /arnold/i, /hack/i, /leg press/i,
  /clean/i, /snatch/i, /thruster/i, /sumo/i, /rumano/i, /rumana/i,
];

function getCategory(muscleGroup: string, exerciseName: string): ExerciseCategory {
  const muscle = muscleGroup.toLowerCase();
  const name   = exerciseName.toLowerCase();

  if (CORE_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "core";
  if (ISOLATION_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "isolation";
  if (COMPOUND_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "compound";
  if (COMPOUND_EXERCISE_PATTERNS.some((p) => p.test(name))) return "compound";

  return "isolation"; // safe default
}

// ─── Rep range ───────────────────────────────────────────────────────────────
interface RepRange {
  min: number;
  max: number;
  zone: "strength" | "hypertrophy" | "endurance";
}

function parseRepRange(repsStr: string | number): RepRange {
  const clean = String(repsStr).trim().toLowerCase();

  if (clean === "amrap" || clean === "max") {
    return { min: 10, max: 20, zone: "endurance" };
  }

  // "8-12" or "8–12"
  const rangeMatch = clean.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    const avg = (min + max) / 2;
    return { min, max, zone: avg <= 5 ? "strength" : avg <= 12 ? "hypertrophy" : "endurance" };
  }

  const n = parseInt(clean);
  if (!isNaN(n) && n > 0) {
    return {
      min: n,
      max: n,
      zone: n <= 5 ? "strength" : n <= 12 ? "hypertrophy" : "endurance",
    };
  }

  return { min: 8, max: 12, zone: "hypertrophy" };
}

// ─── Increment tables ─────────────────────────────────────────────────────────
interface Increments { micro: number; small: number; standard: number; large: number; }

function getIncrements(
  category: ExerciseCategory,
  unit: string,
  zone: RepRange["zone"],
): Increments {
  const lbs = unit === "lbs" || unit === "lb";

  if (category === "compound") {
    if (zone === "strength") {
      return lbs
        ? { micro: 2.5, small: 5, standard: 10, large: 15 }
        : { micro: 1.25, small: 2.5, standard: 5, large: 7.5 };
    }
    // hypertrophy / endurance compound
    return lbs
      ? { micro: 2.5, small: 5, standard: 10, large: 15 }
      : { micro: 1.25, small: 2.5, standard: 5, large: 7.5 };
  }

  if (category === "isolation") {
    return lbs
      ? { micro: 1.25, small: 2.5, standard: 5, large: 5 }
      : { micro: 0.5,  small: 1.25, standard: 2.5, large: 2.5 };
  }

  // core — bodyweight dominant
  return { micro: 0, small: 0, standard: 0, large: 0 };
}

// ─── RPE analytics helpers ────────────────────────────────────────────────────

/**
 * Weighted average RPE — later sets have more influence
 * (they reflect accumulated fatigue and true max effort)
 *
 * Weights: last set × 3, second-to-last × 2, all others × 1
 */
function weightedAvgRpe(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const weights = values.map((_, i) => {
    if (i === values.length - 1) return 3;
    if (i === values.length - 2) return 2;
    return 1;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i], 0);
  return weightedSum / totalWeight;
}

/**
 * Average delta between consecutive RPE values.
 * Positive = fatigue escalating (expected and healthy up to a point).
 * Large positive = unsustainable load.
 * Negative = getting easier (warm-up effect or weight too light).
 */
function rpeTrend(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += values[i] - values[i - 1];
  }
  return sum / (values.length - 1);
}

// ─── Main recommendation function ────────────────────────────────────────────

export function getRPERecommendation(
  muscleGroup: string,
  exerciseName: string,
  sets: SetAnalysis[],
): RPERecommendation | null {
  // Only consider fully completed sets
  const completedSets = sets.filter((s) => s.completed);
  if (completedSets.length === 0) return null;

  // Only consider sets where the user explicitly rated RPE (no defaults)
  const ratedSets = completedSets.filter((s) => s.rpe != null);

  // Require at least 50% of completed sets to have an RPE rating
  const coverageRatio = ratedSets.length / completedSets.length;
  if (ratedSets.length === 0 || coverageRatio < 0.5) return null;

  // ── Context ──────────────────────────────────────────────────────────────
  const category   = getCategory(muscleGroup, exerciseName);
  const unit       = completedSets[0]?.unit ?? "kg";
  const repRange   = parseRepRange(completedSets[0]?.reps ?? "10");
  const increments = getIncrements(category, unit, repRange.zone);
  const setCount   = completedSets.length;

  // Bodyweight detection: all sets have weight === 0
  const isBodyweight = completedSets.every((s) => s.weight === 0);

  // ── RPE analysis ──────────────────────────────────────────────────────────
  const rpeValues   = ratedSets.map((s) => RPE_NUMERIC[s.rpe!]);
  const wAvgRpe     = weightedAvgRpe(rpeValues);
  const simpleAvg   = rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length;
  const lastRpe     = RPE_NUMERIC[ratedSets[ratedSets.length - 1].rpe!];
  const trend       = rpeTrend(rpeValues);
  const failureCount = ratedSets.filter((s) => s.rpe === "failure").length;
  const hardOrFailure = ratedSets.filter((s) => s.rpe === "hard" || s.rpe === "failure").length;
  const easyCount    = ratedSets.filter((s) => s.rpe === "easy").length;

  // Dominant signal: use weighted average (emphasizes last set fatigue)
  const dominantRpe = wAvgRpe;

  // Escalation is dangerous if RPE jumps > 1.5 per set on average
  const rapidEscalation = trend > 1.5;

  // Last set finishing at failure is a strong signal regardless of average
  const finishedAtFailure = lastRpe >= 10;

  // Conservative flag: many sets + high fatigue = be more careful
  const highVolume = setCount >= 4;

  // ── Rep completion analysis ───────────────────────────────────────────────
  // Parse the target reps from the first set (all sets share the same target)
  // to check whether actual performance matches the prescription
  const targetReps = repRange.max;

  // ─────────────────────────────────────────────────────────────────────────
  // BODYWEIGHT / CORE — weight-agnostic recommendations
  // ─────────────────────────────────────────────────────────────────────────
  if (isBodyweight || category === "core") {
    if (dominantRpe < 6) {
      return {
        type: "maintain_increase_reps",
        weightDelta: 0, repsDelta: 3,
        headline: "+3 repeticiones — el estímulo es muy bajo",
        detail: `RPE ponderado ${wAvgRpe.toFixed(1)} indica muy poco esfuerzo para ${muscleGroup}. Agrega 3 reps o busca una variante más difícil.`,
        color: "green", emoji: "💪",
      };
    }
    if (dominantRpe < 7.5) {
      return {
        type: "maintain_increase_reps",
        weightDelta: 0, repsDelta: 2,
        headline: "+2 repeticiones la próxima sesión",
        detail: `Buen trabajo (RPE ~${wAvgRpe.toFixed(1)}). Aún tienes reserva. Agrega 2 reps para progresar.`,
        color: "green", emoji: "📈",
      };
    }
    if (dominantRpe <= 8.5) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Estímulo ideal — repite el mismo volumen",
        detail: `RPE ${wAvgRpe.toFixed(1)} para ${muscleGroup}. Zona perfecta de hipertrofia. La próxima sesión intenta mejorar 1 rep por serie.`,
        color: "blue", emoji: "✅",
      };
    }
    if (failureCount >= Math.ceil(setCount * 0.5)) {
      return {
        type: "decrease_weight_small",
        weightDelta: 0, repsDelta: -3,
        headline: "Reduce el volumen — fallo en múltiples series",
        detail: `Fallo en ${failureCount}/${setCount} series. Reduce 3 reps para recuperarte y acumular buen volumen en las próximas sesiones.`,
        color: "orange", emoji: "⚠️",
      };
    }
    return {
      type: "maintain",
      weightDelta: 0, repsDelta: 0,
      headline: "Mantén el volumen — sesión intensa",
      detail: `Alta intensidad (RPE ${wAvgRpe.toFixed(1)}). Consolida el volumen actual antes de progresar.`,
      color: "yellow", emoji: "⚡",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELOAD TRIGGER — fallo masivo en la sesión
  // ─────────────────────────────────────────────────────────────────────────
  const deloadThreshold = highVolume ? 0.5 : 0.6;
  if (failureCount >= Math.ceil(ratedSets.length * deloadThreshold) && dominantRpe >= 9.5) {
    const currentWeight = completedSets[0].weight || 0;
    const deloadAmount  = Math.max(increments.standard, Math.round(currentWeight * 0.15 / (increments.small || 1.25)) * (increments.small || 1.25));
    return {
      type: "deload",
      weightDelta: -deloadAmount, repsDelta: 0,
      headline: `Semana de descarga — baja ${deloadAmount} ${unit}`,
      detail: `Fallo en ${failureCount} de ${ratedSets.length} series calificadas (RPE ponderado ${wAvgRpe.toFixed(1)}). ${muscleGroup} necesita recuperación. Reduce ~15% y trabaja con técnica perfecta.`,
      color: "red", emoji: "🔴",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRENGTH ZONE (1–5 reps) — different progression model
  // Strength training rarely uses rep ranges for progression; weight is king.
  // ─────────────────────────────────────────────────────────────────────────
  if (repRange.zone === "strength") {
    // All sets easy/normal → ready to add weight
    if (dominantRpe < 7.0) {
      const jump = easyCount === ratedSets.length ? increments.standard : increments.small;
      return {
        type: easyCount === ratedSets.length ? "increase_weight" : "increase_weight_small",
        weightDelta: jump, repsDelta: 0,
        headline: `+${jump} ${unit} — fuerza lista para crecer`,
        detail: `RPE bajo (${wAvgRpe.toFixed(1)}) en zona de fuerza. Tu SNC maneja bien este peso. Sube ${jump} ${unit} la próxima sesión.`,
        color: "green", emoji: "🚀",
      };
    }
    if (dominantRpe >= 7.0 && dominantRpe <= 8.5 && !finishedAtFailure) {
      const potentialIncrease = !rapidEscalation ? increments.micro : 0;
      if (potentialIncrease > 0) {
        return {
          type: "increase_weight_small",
          weightDelta: potentialIncrease, repsDelta: 0,
          headline: `+${potentialIncrease} ${unit} — progresión mínima`,
          detail: `Excelente intensidad para fuerza (RPE ${wAvgRpe.toFixed(1)}). Sube ${potentialIncrease} ${unit} — pequeñas cargas son clave en rangos de fuerza.`,
          color: "green", emoji: "💪",
        };
      }
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Consolida el peso actual",
        detail: `RPE ${wAvgRpe.toFixed(1)} con escalada rápida entre series. Repite el mismo peso y busca mayor consistencia técnica.`,
        color: "blue", emoji: "✅",
      };
    }
    if (dominantRpe > 8.5 && !finishedAtFailure) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — umbral de fuerza máxima",
        detail: `Alta intensidad (RPE ${wAvgRpe.toFixed(1)}) en zona de fuerza. Consolida esta carga antes de incrementar. Prioriza recuperación y sueño.`,
        color: "yellow", emoji: "⚡",
      };
    }
    if (finishedAtFailure && failureCount === 1) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — fallo en última serie",
        detail: `Fallo solo en la última serie. Normal en fuerza máxima. Repite el mismo peso e intenta completar esa última serie la próxima sesión.`,
        color: "yellow", emoji: "⚡",
      };
    }
    if (failureCount >= 2) {
      return {
        type: "decrease_weight_small",
        weightDelta: -increments.small, repsDelta: 0,
        headline: `Baja ${increments.small} ${unit} — carga excesiva para fuerza`,
        detail: `Fallo en ${failureCount} series en zona de fuerza (RPE ${wAvgRpe.toFixed(1)}). Reduce y trabaja en la calidad de cada repetición.`,
        color: "orange", emoji: "⚠️",
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HYPERTROPHY & ENDURANCE ZONES — double progression model
  // Phase 1: Build to top of rep range at current weight
  // Phase 2: Once at top of range with good RPE → increase weight
  // ─────────────────────────────────────────────────────────────────────────

  // ── ZONE: TOO EASY (wAvgRpe < 6.5) ────────────────────────────────────────
  if (dominantRpe < 6.5) {
    // Everything easy — big increase
    if (easyCount === ratedSets.length && !rapidEscalation) {
      return {
        type: "increase_weight_large",
        weightDelta: increments.large, repsDelta: 0,
        headline: `+${increments.large} ${unit} — carga claramente insuficiente`,
        detail: `Todas las series en RPE ${simpleAvg.toFixed(1)} (fácil). Tu ${muscleGroup} ya superó este peso. Sube ${increments.large} ${unit} para generar estímulo real.`,
        color: "green", emoji: "🚀",
      };
    }
    // Mostly easy but some variation
    return {
      type: "increase_weight",
      weightDelta: increments.standard, repsDelta: 0,
      headline: `+${increments.standard} ${unit} la próxima sesión`,
      detail: `Esfuerzo bajo (RPE ponderado ${wAvgRpe.toFixed(1)}). Para ${category === "compound" ? "movimientos compuestos" : "aislamiento"} en zona ${repRange.zone === "hypertrophy" ? "hipertrófica" : "de resistencia"}, sube ${increments.standard} ${unit}.`,
      color: "green", emoji: "⬆️",
    };
  }

  // ── ZONE: IDEAL (wAvgRpe 6.5–8.5) ─────────────────────────────────────────
  if (dominantRpe >= 6.5 && dominantRpe <= 8.5) {
    // ─ HIGH COVERAGE: all sets rated — give most accurate recommendation
    const allSetsRated = ratedSets.length === completedSets.length;

    // Rapid RPE escalation = weight might be slightly too heavy for the volume
    if (rapidEscalation && highVolume && hardOrFailure >= 2) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — fatiga acumulada alta",
        detail: `RPE escala rápidamente (+${trend.toFixed(1)}/serie) con ${setCount} series. Perfecto estímulo. La próxima sesión trabaja hacia ${targetReps} reps con mejor distribución de esfuerzo.`,
        color: "yellow", emoji: "⚡",
      };
    }

    // Ideal zone with room to add reps (below or at target)
    if (!rapidEscalation || rpeValues[rpeValues.length - 1] <= 8.5) {
      // If this is a fixed-rep prescription (min === max), treat as top of range
      const fixedReps = repRange.min === repRange.max;

      if (fixedReps && allSetsRated && dominantRpe >= 6.5 && dominantRpe <= 7.5) {
        // Fixed rep scheme, feeling easy-to-moderate → increase weight
        return {
          type: "increase_weight",
          weightDelta: increments.standard, repsDelta: 0,
          headline: `+${increments.standard} ${unit} — todas las reps completadas con margen`,
          detail: `Completaste ${targetReps} reps en todas las series con RPE ${wAvgRpe.toFixed(1)}. Con prescripción fija, es momento de subir ${increments.standard} ${unit}.`,
          color: "green", emoji: "🎯",
        };
      }

      // Rep range prescription — double progression
      if (allSetsRated && dominantRpe >= 7.5 && dominantRpe <= 8.5) {
        // At ideal intensity with full data — standard weight increase
        return {
          type: "increase_weight",
          weightDelta: increments.standard, repsDelta: 0,
          headline: `¡Progresión lista! +${increments.standard} ${unit}`,
          detail: `RPE ideal (${wAvgRpe.toFixed(1)}) con cobertura completa. Completaste el trabajo con excelente intensidad. Sube ${increments.standard} ${unit} la próxima sesión.`,
          color: "green", emoji: "🎯",
        };
      }

      // Good intensity — add reps before weight (double progression phase 1)
      return {
        type: "maintain_increase_reps",
        weightDelta: 0, repsDelta: 1,
        headline: "Mantén el peso, busca 1 rep más por serie",
        detail: `Zona óptima (RPE ${wAvgRpe.toFixed(1)}). ${allSetsRated ? "Datos completos." : "Califica más series para mayor precisión."} Acumula reps hacia ${targetReps} antes de subir peso.`,
        color: "blue", emoji: "📈",
      };
    }

    // Safe fallback within ideal zone
    return {
      type: "maintain_increase_reps",
      weightDelta: 0, repsDelta: 1,
      headline: "Mantén la carga y acumula +1 rep",
      detail: `Buen estímulo (RPE ${wAvgRpe.toFixed(1)}). Antes de subir peso, llega a ${targetReps} reps en todas las series con esta misma carga.`,
      color: "blue", emoji: "📊",
    };
  }

  // ── ZONE: HARD (wAvgRpe 8.5–9.5) ──────────────────────────────────────────
  if (dominantRpe > 8.5 && dominantRpe <= 9.5) {
    if (!finishedAtFailure && !rapidEscalation) {
      // Pushed hard but under control — micro increment for compound, maintain for isolation
      if (category === "compound") {
        return {
          type: "increase_weight_small",
          weightDelta: increments.micro, repsDelta: 0,
          headline: `Esfuerzo al límite. +${increments.micro} ${unit}`,
          detail: `Series muy duras (RPE ${wAvgRpe.toFixed(1)}) sin fallo y sin escalada rápida. Excelente calidad. Prueba +${increments.micro} ${unit} la próxima sesión.`,
          color: "green", emoji: "💪",
        };
      }
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — límite de intensidad para aislamiento",
        detail: `Alta intensidad (RPE ${wAvgRpe.toFixed(1)}) en ejercicio de aislamiento. Consolida este peso antes de incrementar para proteger articulaciones y tendones.`,
        color: "yellow", emoji: "⚡",
      };
    }

    if (rapidEscalation) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — fatiga escalando rápido",
        detail: `RPE sube +${trend.toFixed(1)} por serie con intensidad final muy alta (${wAvgRpe.toFixed(1)}). Repite el mismo peso y busca mayor consistencia de esfuerzo entre series.`,
        color: "yellow", emoji: "⚡",
      };
    }

    if (finishedAtFailure && failureCount === 1) {
      if (category === "compound") {
        return {
          type: "maintain",
          weightDelta: 0, repsDelta: 0,
          headline: "Buen trabajo — mantén el peso",
          detail: `Fallo solo en la última serie para ${muscleGroup}. Indica reclutamiento máximo. Repite el mismo peso e intenta completarla la próxima sesión.`,
          color: "yellow", emoji: "⚡",
        };
      }
      return {
        type: "decrease_weight_small",
        weightDelta: -increments.small, repsDelta: 0,
        headline: `Baja ${increments.small} ${unit} — fallo en última serie de aislamiento`,
        detail: `En aislamiento el fallo aumenta riesgo de lesión. Baja ${increments.small} ${unit} y trabaja con control total del recorrido.`,
        color: "orange", emoji: "⚠️",
      };
    }

    // Hard with multiple failures in this zone
    return {
      type: "decrease_weight_small",
      weightDelta: -increments.small, repsDelta: 0,
      headline: `Reduce ${increments.small} ${unit} — sobre-esfuerzo`,
      detail: `Fallo en ${failureCount} series con RPE muy alto (${wAvgRpe.toFixed(1)}). Baja un poco para poder completar las series con buena técnica y mayor volumen efectivo.`,
      color: "orange", emoji: "⚠️",
    };
  }

  // ── ZONE: FAILURE / NEAR FAILURE (wAvgRpe > 9.5) ──────────────────────────
  if (failureCount >= 2) {
    return {
      type: "decrease_weight",
      weightDelta: -increments.standard, repsDelta: 0,
      headline: `Reduce ${increments.standard} ${unit} — peso excesivo`,
      detail: `Fallo en ${failureCount}/${ratedSets.length} series (RPE ${wAvgRpe.toFixed(1)}). Este peso supera tu capacidad de trabajo actual. Baja ${increments.standard} ${unit} y reconstruye con buena técnica.`,
      color: "red", emoji: "🔽",
    };
  }

  // Single failure at end — near-maximal effort
  if (failureCount === 1) {
    return {
      type: "maintain",
      weightDelta: 0, repsDelta: 0,
      headline: "Mantén el peso — esfuerzo casi máximo",
      detail: `Una serie al fallo con RPE global muy alto (${wAvgRpe.toFixed(1)}). Sesión muy exigente. Repite el peso, descansa bien y mejora la nutrición post-entreno.`,
      color: "yellow", emoji: "💛",
    };
  }

  // Fallback — high RPE but no failure
  return {
    type: "maintain",
    weightDelta: 0, repsDelta: 0,
    headline: "Mantén la carga — sesión al límite",
    detail: `Intensidad muy alta (RPE ${wAvgRpe.toFixed(1)}) sin llegar al fallo. Excelente control. Consolida este peso y prioriza recuperación.`,
    color: "yellow", emoji: "💛",
  };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export const RPE_LABELS: Record<RPEValue, { label: string; emoji: string; description: string }> = {
  easy:    { label: "Fácil",   emoji: "😊", description: "Podría hacer 4+ reps más" },
  normal:  { label: "Normal",  emoji: "😐", description: "2-3 reps de reserva" },
  hard:    { label: "Duro",    emoji: "😤", description: "Solo 1 rep más" },
  failure: { label: "Fallo",   emoji: "💀", description: "Límite total" },
};

export const RPE_COLORS: Record<RPEValue, string> = {
  easy:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  normal:  "bg-green-500/15 text-green-400 border-green-500/30",
  hard:    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  failure: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const RECOMMENDATION_COLORS: Record<RPERecommendation["color"], string> = {
  green:  "bg-green-500/10 border-green-500/30 text-green-400",
  blue:   "bg-blue-500/10 border-blue-500/30 text-blue-400",
  yellow: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
  red:    "bg-red-500/10 border-red-500/30 text-red-400",
};
