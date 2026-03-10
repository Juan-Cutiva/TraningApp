/**
 * RPE-based progression recommendation engine — v4
 *
 * Based on: Schoenfeld 2017 (dose-response meta-analysis), Helms 2016 (RPE for
 * resistance training), Zourdos 2016 (RPE-RIR relationship), Hackett 2018
 * (muscle-size-dependent recovery), Ogasawara 2013 (detraining/retraining).
 *
 * Factors analysed:
 *  - Weighted RPE (last sets carry more weight — represent peak accumulated fatigue)
 *  - RPE fatigue trend across sets (escalation rate)
 *  - RPE variance (inconsistent effort = pacing problem)
 *  - Actual reps performed vs TARGET rep range (real completion quality)
 *  - At-top-of-range detection for double progression trigger
 *  - Rep deficit detection (consistently missing target = too heavy regardless of RPE)
 *  - Catastrophic fatigue jump (RPE spike > 3pts between consecutive sets)
 *  - **Failure position awareness** — early failure (set 1-2) is far more significant than
 *    late failure (set 3+). Early failure = weight too heavy. Late failure = expected
 *    accumulated fatigue (Helms 2016).
 *  - **Muscle size tiering** — large muscles (chest, back, quads) tolerate bigger
 *    increments and more failure volume than small muscles (biceps, triceps) or
 *    medium muscles (shoulders, hamstrings). Based on Hackett 2018.
 *  - Exercise category (compound / isolation / core / bodyweight)
 *  - Rep zone (strength 1-5 / hypertrophy 6-12 / endurance 13+)
 *  - Coverage ratio (won't recommend without sufficient RPE data)
 *  - Set count (more sets = higher accumulated fatigue = conservative adjustments)
 *  - Unit-aware increments (kg vs lbs, different for each zone and category)
 *  - Double progression model (reps first → weight second, properly gated by range position)
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
  /** Actual reps the user performed this set */
  reps: string | number;
  /** Target reps from the routine definition (e.g. "8-12", "10", "AMRAP") */
  targetReps?: string | number;
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

/**
 * Muscle size tier — determines increment aggressiveness and failure tolerance.
 * Based on Hackett 2018 (muscle-specific hypertrophy and recovery) and
 * practical coaching consensus.
 *
 * - large: pecho, espalda, cuádriceps, glúteos — high capacity, bigger increments
 * - medium: hombros, isquiotibiales, trapecio — moderate capacity
 * - small: bíceps, tríceps, antebrazos, pantorrillas — fragile, conservative
 */
type MuscleSizeTier = "large" | "medium" | "small";

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

// ── Muscle size keywords ──
const LARGE_MUSCLE_KEYWORDS = [
  "pecho", "espalda", "dorsales", "piernas",
  "cuádriceps", "cuadriceps", "glúteos", "gluteos",
];
const MEDIUM_MUSCLE_KEYWORDS = [
  "hombros", "trapecio", "isquiotibiales", "femoral",
  "aductores", "abductores",
];
// Small = everything else (biceps, triceps, forearms, calves, rotator cuff)

function getCategory(muscleGroup: string, exerciseName: string): ExerciseCategory {
  const muscle = muscleGroup.toLowerCase();
  const name   = exerciseName.toLowerCase();

  if (CORE_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "core";
  if (ISOLATION_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "isolation";
  if (COMPOUND_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "compound";
  if (COMPOUND_EXERCISE_PATTERNS.some((p) => p.test(name))) return "compound";

  return "isolation"; // safe default
}

function getMuscleSizeTier(muscleGroup: string): MuscleSizeTier {
  const muscle = muscleGroup.toLowerCase();
  if (LARGE_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "large";
  if (MEDIUM_MUSCLE_KEYWORDS.some((k) => muscle.includes(k))) return "medium";
  return "small";
}

// ─── Failure position analysis ───────────────────────────────────────────────
/**
 * Analyses WHERE in the session failure occurred. Based on Helms 2016:
 * - Failure in sets 1-2 with 3+ total sets → weight is objectively too heavy
 * - Failure only in last set → normal accumulated fatigue, acceptable
 * - Failure spread across middle sets → pacing/recovery issue
 */
interface FailureProfile {
  /** Total failures */
  count: number;
  /** True if any failure in the first 2 sets (with 3+ total sets) */
  earlyFailure: boolean;
  /** True if failure ONLY in the last set */
  onlyLastSetFailure: boolean;
  /** Position of first failure (1-based) */
  firstFailurePosition: number;
  /** Ratio of total sets that are failures */
  failureRate: number;
}

function analyzeFailurePosition(ratedSets: { rpe?: RPEValue }[]): FailureProfile {
  const failureIndices: number[] = [];
  ratedSets.forEach((s, i) => {
    if (s.rpe === "failure") failureIndices.push(i);
  });
  const count = failureIndices.length;
  const total = ratedSets.length;
  return {
    count,
    earlyFailure: count > 0 && total >= 3 && failureIndices[0] < 2,
    onlyLastSetFailure: count === 1 && failureIndices[0] === total - 1,
    firstFailurePosition: count > 0 ? failureIndices[0] + 1 : 0,
    failureRate: total > 0 ? count / total : 0,
  };
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
// Now muscle-size-aware: large muscles get bigger jumps, small muscles get
// conservative micro-progressions. Based on practical coaching data and
// Hackett 2018 (muscle-specific adaptation rates).
interface Increments { micro: number; small: number; standard: number; large: number; }

function getIncrements(
  category: ExerciseCategory,
  unit: string,
  zone: RepRange["zone"],
  muscleTier: MuscleSizeTier = "large",
): Increments {
  const lbs = unit === "lbs" || unit === "lb";

  if (category === "compound") {
    if (muscleTier === "large") {
      // Pecho, espalda, cuádriceps, glúteos — full standard increments
      return lbs
        ? { micro: 2.5, small: 5, standard: 10, large: 15 }
        : { micro: 1.25, small: 2.5, standard: 5, large: 7.5 };
    }
    if (muscleTier === "medium") {
      // Hombros, isquiotibiales — reduced increments (~60-75% of large)
      return lbs
        ? { micro: 2.5, small: 2.5, standard: 5, large: 10 }
        : { micro: 1.0, small: 1.25, standard: 2.5, large: 5 };
    }
    // Small muscle compound (rare, e.g. close-grip bench for triceps)
    return lbs
      ? { micro: 1.25, small: 2.5, standard: 5, large: 5 }
      : { micro: 0.5, small: 1.25, standard: 2.5, large: 2.5 };
  }

  if (category === "isolation") {
    if (muscleTier === "large" || muscleTier === "medium") {
      return lbs
        ? { micro: 1.25, small: 2.5, standard: 5, large: 5 }
        : { micro: 0.5, small: 1.25, standard: 2.5, large: 2.5 };
    }
    // Small muscles (biceps, triceps, forearms, calves) — minimal increments
    return lbs
      ? { micro: 1.25, small: 1.25, standard: 2.5, large: 2.5 }
      : { micro: 0.5, small: 0.5, standard: 1.25, large: 1.25 };
  }

  // core — bodyweight dominant
  return { micro: 0, small: 0, standard: 0, large: 0 };
}

// ─── RPE analytics helpers ────────────────────────────────────────────────────

/**
 * Weighted average RPE — later sets have more influence
 * (they reflect accumulated fatigue and true max effort)
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
 * Positive = fatigue escalating. Large positive = unsustainable load.
 */
function rpeTrend(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += values[i] - values[i - 1];
  }
  return sum / (values.length - 1);
}

/**
 * Standard deviation of RPE values.
 * High variance (> 2.5) = inconsistent effort / pacing problem.
 */
function rpeStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
}

/**
 * Detects a catastrophic fatigue jump: any adjacent pair where RPE spikes > 3 pts.
 * Example: easy (5.5) → failure (10.0) = jump of 4.5 → catastrophic.
 */
function hasCatastrophicJump(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i] - values[i - 1] > 3) return true;
  }
  return false;
}

// ─── Rep completion helpers ───────────────────────────────────────────────────

/** Parse actual reps from a set (handles string input) */
function parseActualReps(reps: string | number): number {
  return parseInt(String(reps), 10) || 0;
}

/**
 * Fraction of completed sets that reached or exceeded the TOP of the target rep range.
 * Used to trigger double-progression weight increase.
 * Returns 0–1. >= 0.75 means "consistently at ceiling → ready to increase weight".
 */
function fractionAtTopOfRange(sets: SetAnalysis[], targetRange: RepRange): number {
  if (sets.length === 0) return 0;
  const atTop = sets.filter(s => parseActualReps(s.reps) >= targetRange.max);
  return atTop.length / sets.length;
}

/**
 * Fraction of completed sets that FAILED to reach the BOTTOM of the target rep range.
 * If > 0.5, the weight is likely too heavy — user can't even start the range.
 */
function fractionBelowMinReps(sets: SetAnalysis[], targetRange: RepRange): number {
  if (sets.length === 0) return 0;
  // Fixed rep schemes: same min and max, so compare to min - 2 (allow 2-rep shortfall)
  const threshold = targetRange.min === targetRange.max
    ? Math.max(1, targetRange.min - 2)
    : targetRange.min;
  const below = sets.filter(s => parseActualReps(s.reps) < threshold);
  return below.length / sets.length;
}

/**
 * Average actual reps as a ratio of the target max.
 * > 1.0 = consistently exceeding target (ready to increase weight or progress).
 * < 0.8 = falling significantly short of target.
 */
function avgRepRatio(sets: SetAnalysis[], targetRange: RepRange): number {
  if (sets.length === 0 || targetRange.max === 0) return 1;
  const ratios = sets.map(s => parseActualReps(s.reps) / targetRange.max);
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
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
  const muscleTier = getMuscleSizeTier(muscleGroup);
  const unit       = completedSets[0]?.unit ?? "kg";
  const setCount   = completedSets.length;

  // Rep range: prefer targetReps field (from routine), fall back to actual reps
  const targetRepsSource = completedSets.find(s => s.targetReps)?.targetReps ?? completedSets[0]?.reps ?? "10";
  const repRange   = parseRepRange(targetRepsSource);
  const increments = getIncrements(category, unit, repRange.zone, muscleTier);

  // Bodyweight detection: all sets have weight === 0
  const isBodyweight = completedSets.every((s) => s.weight === 0);

  // ── RPE analysis ──────────────────────────────────────────────────────────
  const rpeValues    = ratedSets.map((s) => RPE_NUMERIC[s.rpe!]);
  const wAvgRpe      = weightedAvgRpe(rpeValues);
  const simpleAvg    = rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length;
  const lastRpe      = RPE_NUMERIC[ratedSets[ratedSets.length - 1].rpe!];
  const trend        = rpeTrend(rpeValues);
  const stdDev       = rpeStdDev(rpeValues);
  const failureCount = ratedSets.filter((s) => s.rpe === "failure").length;
  const hardOrFail   = ratedSets.filter((s) => s.rpe === "hard" || s.rpe === "failure").length;
  const easyCount    = ratedSets.filter((s) => s.rpe === "easy").length;

  const dominantRpe        = wAvgRpe;
  const rapidEscalation    = trend > 1.5;
  const finishedAtFailure  = lastRpe >= 10;
  const highVolume         = setCount >= 4;
  const inconsistentPacing = stdDev > 2.5 && rpeValues.length >= 3;
  const catastrophicJump   = hasCatastrophicJump(rpeValues);

  // ── Failure position analysis (v4) ──────────────────────────────────────
  const fp = analyzeFailurePosition(ratedSets);

  // ── Rep completion analysis ───────────────────────────────────────────────
  const topFraction   = fractionAtTopOfRange(completedSets, repRange);
  const belowFraction = fractionBelowMinReps(completedSets, repRange);
  const repRatio      = avgRepRatio(completedSets, repRange);

  // Consistently hitting ceiling of rep range (≥75% sets at or above max target reps)
  const atCeilingOfRange = topFraction >= 0.75;
  // Fixed rep prescription (e.g., "10" not "8-12")
  const fixedReps        = repRange.min === repRange.max;
  // Significantly missing rep targets (>50% sets below minimum target)
  const severeRepDeficit = belowFraction > 0.5 && repRange.min > 1;

  // ─────────────────────────────────────────────────────────────────────────
  // EARLY EXIT: SEVERE REP DEFICIT
  // If user is consistently failing to reach even the minimum of the rep range,
  // the weight is objectively too heavy regardless of what they say about RPE.
  // ─────────────────────────────────────────────────────────────────────────
  if (severeRepDeficit && !isBodyweight && category !== "core") {
    const shortfall = repRange.min - Math.round(repRatio * repRange.max);
    return {
      type: "decrease_weight_small",
      weightDelta: -increments.small, repsDelta: 0,
      headline: `Reduce ${increments.small} ${unit} — no alcanzas el rango objetivo`,
      detail: `Completaste menos de ${repRange.min} reps en más de la mitad de las series (objetivo: ${repRange.min}–${repRange.max} reps). ${shortfall > 0 ? `Te faltan ~${shortfall} reps por serie.` : ""} Baja ${increments.small} ${unit} para poder trabajar dentro del rango.`,
      color: "orange", emoji: "⚠️",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EARLY FAILURE — v4: failure in set 1 or 2 (with 3+ sets) means weight
  // is objectively too heavy. Different from accumulated fatigue failure
  // in the last set. Helms 2016: early RIR=0 indicates load exceeds capacity.
  // ─────────────────────────────────────────────────────────────────────────
  if (fp.earlyFailure && !isBodyweight && category !== "core") {
    // Early failure = weight clearly too heavy — recommend meaningful decrease
    const decreaseAmt = muscleTier === "small" ? increments.small : increments.standard;
    return {
      type: "decrease_weight",
      weightDelta: -decreaseAmt, repsDelta: 0,
      headline: `Reduce ${decreaseAmt} ${unit} — fallo temprano (serie ${fp.firstFailurePosition})`,
      detail: `Llegaste al fallo en la serie ${fp.firstFailurePosition} de ${setCount}. Eso indica que el peso supera tu capacidad actual — no es fatiga acumulada, es exceso de carga. ${muscleTier === "small" ? `Para ${muscleGroup} (músculo pequeño) es especialmente importante no sobrecargar.` : `Baja ${decreaseAmt} ${unit} para poder completar las series con calidad.`}`,
      color: "orange", emoji: "⚠️",
    };
  }

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
        detail: `RPE ${wAvgRpe.toFixed(1)} para ${muscleGroup}. Zona perfecta. La próxima sesión intenta mejorar 1 rep por serie.`,
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
  // CATASTROPHIC JUMP DETECTION
  // If RPE spikes > 3 pts between any adjacent sets, weight selection is poor.
  // ─────────────────────────────────────────────────────────────────────────
  if (catastrophicJump && hardOrFail >= 2) {
    return {
      type: "decrease_weight_small",
      weightDelta: -increments.small, repsDelta: 0,
      headline: `Fatiga disparada — baja ${increments.small} ${unit}`,
      detail: `Tu RPE se disparó bruscamente entre series (variación >3 pts). El peso puede ser correcto pero la distribución del esfuerzo es inconsistente. Baja ${increments.small} ${unit} y trabaja con esfuerzo más uniforme.`,
      color: "orange", emoji: "⚠️",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INCONSISTENT PACING DETECTION
  // High RPE std dev = effort varies wildly = pacing problem.
  // ─────────────────────────────────────────────────────────────────────────
  if (inconsistentPacing && dominantRpe >= 7 && dominantRpe <= 9) {
    return {
      type: "maintain",
      weightDelta: 0, repsDelta: 0,
      headline: "Mantén el peso — distribuye mejor el esfuerzo",
      detail: `Tu RPE varía mucho entre series (desviación ${stdDev.toFixed(1)}). Indica un problema de ritmo: arrantas demasiado fuerte o muy suave. Mantén el mismo peso y enfócate en una intensidad consistente en todas las series.`,
      color: "yellow", emoji: "⚡",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DELOAD TRIGGER — fallo masivo en la sesión
  // ─────────────────────────────────────────────────────────────────────────
  // Small muscles need deload with less failure volume (more fragile joints/tendons)
  const deloadThreshold = muscleTier === "small" ? 0.4 : highVolume ? 0.5 : 0.6;
  if (failureCount >= Math.ceil(ratedSets.length * deloadThreshold) && dominantRpe >= 9.5) {
    const currentWeight = completedSets[0].weight || 0;
    const deloadAmount  = Math.max(
      increments.standard,
      Math.round(currentWeight * 0.15 / (increments.small || 1.25)) * (increments.small || 1.25),
    );
    const cappedDeload = Math.min(deloadAmount, currentWeight * 0.20); // max 20% deload
    return {
      type: "deload",
      weightDelta: -Math.round(cappedDeload * 4) / 4, repsDelta: 0,
      headline: `Semana de descarga — baja ~${Math.round(cappedDeload * 4) / 4} ${unit}`,
      detail: `Fallo en ${failureCount} de ${ratedSets.length} series calificadas (RPE ponderado ${wAvgRpe.toFixed(1)}). ${muscleGroup} necesita recuperación. Reduce ~15% y trabaja con técnica perfecta durante 1 semana.`,
      color: "red", emoji: "🔴",
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRENGTH ZONE (1–5 reps) — weight progression is primary lever
  // ─────────────────────────────────────────────────────────────────────────
  if (repRange.zone === "strength") {
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
  // Phase 1: Build toward top of rep range at current weight
  // Phase 2: Once CONSISTENTLY at top of range with good RPE → increase weight
  // ─────────────────────────────────────────────────────────────────────────

  // ── ZONE: TOO EASY (wAvgRpe < 6.5) ────────────────────────────────────────
  if (dominantRpe < 6.5) {
    // At top of range + everything easy → bigger jump
    if (atCeilingOfRange && easyCount === ratedSets.length && !rapidEscalation) {
      return {
        type: "increase_weight_large",
        weightDelta: increments.large, repsDelta: 0,
        headline: `+${increments.large} ${unit} — superaste el rango y estuvo fácil`,
        detail: `Completaste ≥${repRange.max} reps en la mayoría de series con RPE ${simpleAvg.toFixed(1)} (fácil). Has superado claramente este peso. Sube ${increments.large} ${unit}.`,
        color: "green", emoji: "🚀",
      };
    }
    // At top of range but not all sets easy
    if (atCeilingOfRange) {
      return {
        type: "increase_weight",
        weightDelta: increments.standard, repsDelta: 0,
        headline: `+${increments.standard} ${unit} — techo del rango alcanzado`,
        detail: `Completaste el máximo de ${repRange.max} reps en la mayoría de series con RPE bajo. Listo para subir ${increments.standard} ${unit}.`,
        color: "green", emoji: "⬆️",
      };
    }
    // Everything easy but not at top → add reps before weight
    if (easyCount === ratedSets.length && !rapidEscalation) {
      return {
        type: "increase_weight_large",
        weightDelta: increments.large, repsDelta: 0,
        headline: `+${increments.large} ${unit} — carga claramente insuficiente`,
        detail: `Todas las series en RPE ${simpleAvg.toFixed(1)} (fácil). Tu ${muscleGroup} ya superó este peso. Sube ${increments.large} ${unit} para generar estímulo real.`,
        color: "green", emoji: "🚀",
      };
    }
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
    const allSetsRated = ratedSets.length === completedSets.length;

    // Rapid RPE escalation with high volume = weight might be too heavy for this volume
    if (rapidEscalation && highVolume && hardOrFail >= 2) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — fatiga acumulada alta",
        detail: `RPE escala rápidamente (+${trend.toFixed(1)}/serie) con ${setCount} series. Perfecto estímulo. La próxima sesión trabaja hacia ${repRange.max} reps con mejor distribución de esfuerzo.`,
        color: "yellow", emoji: "⚡",
      };
    }

    // ── KEY: At ceiling of range → trigger weight increase (double progression Phase 2)
    if (atCeilingOfRange && dominantRpe >= 6.5 && dominantRpe <= 8.5) {
      if (dominantRpe <= 7.5) {
        // At ceiling and feeling easy-moderate → confident weight increase
        return {
          type: "increase_weight",
          weightDelta: increments.standard, repsDelta: 0,
          headline: `¡Progresión lista! +${increments.standard} ${unit}`,
          detail: `Completaste ${repRange.max} reps en la mayoría de series con RPE ${wAvgRpe.toFixed(1)}. Has alcanzado el techo del rango (${repRange.min}–${repRange.max}) con margen. Sube ${increments.standard} ${unit} la próxima sesión.`,
          color: "green", emoji: "🎯",
        };
      }
      // At ceiling but intensity is high — muscle size determines response
      if (muscleTier === "large") {
        return {
          type: "increase_weight_small",
          weightDelta: increments.micro, repsDelta: 0,
          headline: `+${increments.micro} ${unit} — techo alcanzado con intensidad alta`,
          detail: `Completaste el techo de ${repRange.max} reps con RPE ${wAvgRpe.toFixed(1)}. ${muscleGroup} (músculo grande) tolera la progresión. Sube ${increments.micro} ${unit}.`,
          color: "green", emoji: "💪",
        };
      }
      if (muscleTier === "medium") {
        return {
          type: "increase_weight_small",
          weightDelta: increments.micro, repsDelta: 0,
          headline: `+${increments.micro} ${unit} — progresión prudente`,
          detail: `Techo de ${repRange.max} reps con RPE ${wAvgRpe.toFixed(1)}. Para ${muscleGroup} sube solo ${increments.micro} ${unit} — los músculos medianos progresan más lento.`,
          color: "green", emoji: "💪",
        };
      }
      // Small muscles — don't increase at high RPE, consolidate
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — techo con esfuerzo alto",
        detail: `Alcanzaste ${repRange.max} reps con RPE ${wAvgRpe.toFixed(1)} en ${muscleGroup} (músculo pequeño). Consolida este peso antes de subir — los músculos pequeños necesitan más adaptación entre incrementos.`,
        color: "blue", emoji: "✅",
      };
    }

    // ── Fixed rep prescription (e.g., "3x10") — at target with good RPE → increase
    if (fixedReps && allSetsRated) {
      if (dominantRpe >= 6.5 && dominantRpe <= 7.5) {
        return {
          type: "increase_weight",
          weightDelta: increments.standard, repsDelta: 0,
          headline: `+${increments.standard} ${unit} — todas las reps completadas con margen`,
          detail: `Completaste ${repRange.min} reps en todas las series con RPE ${wAvgRpe.toFixed(1)}. Con prescripción fija es momento de subir ${increments.standard} ${unit}.`,
          color: "green", emoji: "🎯",
        };
      }
      if (dominantRpe > 7.5 && dominantRpe <= 8.5 && !rapidEscalation) {
        return {
          type: "increase_weight_small",
          weightDelta: increments.micro, repsDelta: 0,
          headline: `+${increments.micro} ${unit} — progresión mínima`,
          detail: `Completaste la prescripción de ${repRange.min} reps con RPE ${wAvgRpe.toFixed(1)}. Sube ${increments.micro} ${unit} para mantener la sobrecarga progresiva.`,
          color: "green", emoji: "💪",
        };
      }
    }

    // ── Rep range prescription (double progression Phase 1)
    // Not at ceiling yet — build reps before weight
    if (!rapidEscalation || rpeValues[rpeValues.length - 1] <= 8.5) {
      const repsBeforeCeiling = repRange.max - Math.round(repRatio * repRange.max);
      const repsText = repsBeforeCeiling > 1
        ? `Aún te faltan ~${repsBeforeCeiling} reps para llegar al techo de ${repRange.max}.`
        : `Estás cerca del techo (${repRange.max} reps).`;

      return {
        type: "maintain_increase_reps",
        weightDelta: 0, repsDelta: 1,
        headline: "Mantén el peso, busca 1 rep más por serie",
        detail: `Zona óptima (RPE ${wAvgRpe.toFixed(1)}). ${repsText} Cuando llegues a ${repRange.max} reps en todas las series con este esfuerzo, sube el peso.`,
        color: "blue", emoji: "📈",
      };
    }

    return {
      type: "maintain_increase_reps",
      weightDelta: 0, repsDelta: 1,
      headline: "Mantén la carga y acumula +1 rep",
      detail: `Buen estímulo (RPE ${wAvgRpe.toFixed(1)}). Antes de subir peso, llega a ${repRange.max} reps en todas las series con esta misma carga.`,
      color: "blue", emoji: "📊",
    };
  }

  // ── ZONE: HARD (wAvgRpe 8.5–9.5) ──────────────────────────────────────────
  if (dominantRpe > 8.5 && dominantRpe <= 9.5) {
    // At ceiling even while hard — still warrants small increase for compound
    if (atCeilingOfRange && !finishedAtFailure && category === "compound") {
      return {
        type: "increase_weight_small",
        weightDelta: increments.micro, repsDelta: 0,
        headline: `+${increments.micro} ${unit} — techo alcanzado aunque intenso`,
        detail: `Completaste ${repRange.max} reps en la mayoría de series incluso con RPE ${wAvgRpe.toFixed(1)}. Eso demuestra adaptación. Sube ${increments.micro} ${unit} con precaución.`,
        color: "green", emoji: "💪",
      };
    }

    if (!finishedAtFailure && !rapidEscalation) {
      // v4: Only large/medium muscles can progress at high RPE
      if (muscleTier === "large" || (muscleTier === "medium" && category === "compound")) {
        return {
          type: "increase_weight_small",
          weightDelta: increments.micro, repsDelta: 0,
          headline: `Esfuerzo al límite. +${increments.micro} ${unit}`,
          detail: `Series muy duras (RPE ${wAvgRpe.toFixed(1)}) sin fallo y sin escalada rápida. ${muscleTier === "large" ? `${muscleGroup} aguanta la progresión.` : `Progresión mínima para ${muscleGroup}.`} Prueba +${increments.micro} ${unit}.`,
          color: "green", emoji: "💪",
        };
      }
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — límite para este músculo",
        detail: `Alta intensidad (RPE ${wAvgRpe.toFixed(1)}) en ${muscleGroup}${muscleTier === "small" ? " (músculo pequeño)" : ""}. Consolida este peso — los músculos más pequeños necesitan más tiempo para adaptar tendones y articulaciones.`,
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
      // v4: Last-set-only failure — normal accumulated fatigue for large/medium muscles
      if (fp.onlyLastSetFailure && (muscleTier === "large" || muscleTier === "medium")) {
        return {
          type: "maintain",
          weightDelta: 0, repsDelta: 0,
          headline: "Buen trabajo — mantén el peso",
          detail: `Fallo solo en la última serie para ${muscleGroup}. Es fatiga acumulada normal${muscleTier === "large" ? " en un músculo grande" : ""}. Repite el mismo peso e intenta completar esa última serie la próxima sesión.`,
          color: "yellow", emoji: "⚡",
        };
      }
      // Small muscles or non-last-set failure — more conservative
      return {
        type: "decrease_weight_small",
        weightDelta: -increments.small, repsDelta: 0,
        headline: `Baja ${increments.small} ${unit} — fallo en ${muscleTier === "small" ? "músculo pequeño" : "serie intermedia"}`,
        detail: `${muscleTier === "small" ? `Para ${muscleGroup} (músculo pequeño), el fallo aumenta riesgo en tendones y articulaciones.` : `El fallo no fue en la última serie, lo que indica que el peso puede ser excesivo.`} Baja ${increments.small} ${unit} y trabaja con control total.`,
        color: "orange", emoji: "⚠️",
      };
    }

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
    // v4: Multiple failures — scale response by muscle size
    const decreaseAmt = muscleTier === "small" ? increments.small : increments.standard;
    return {
      type: "decrease_weight",
      weightDelta: -decreaseAmt, repsDelta: 0,
      headline: `Reduce ${decreaseAmt} ${unit} — peso excesivo`,
      detail: `Fallo en ${failureCount}/${ratedSets.length} series (RPE ${wAvgRpe.toFixed(1)}).${fp.earlyFailure ? ` Primer fallo en serie ${fp.firstFailurePosition} — la carga es demasiado alta.` : ""} ${muscleTier === "small" ? `Para ${muscleGroup} baja ${decreaseAmt} ${unit} (progresión conservadora).` : `Baja ${decreaseAmt} ${unit} y reconstruye con buena técnica.`}`,
      color: "red", emoji: "🔽",
    };
  }

  if (failureCount === 1) {
    // v4: single failure at high RPE — last set vs earlier matters
    if (fp.onlyLastSetFailure) {
      return {
        type: "maintain",
        weightDelta: 0, repsDelta: 0,
        headline: "Mantén el peso — fallo solo en última serie",
        detail: `Fallo en la última serie con RPE global ${wAvgRpe.toFixed(1)}. Es fatiga acumulada normal. Repite el peso, descansa bien y mejora la nutrición post-entreno.`,
        color: "yellow", emoji: "💛",
      };
    }
    return {
      type: "decrease_weight_small",
      weightDelta: -increments.small, repsDelta: 0,
      headline: `Baja ${increments.small} ${unit} — fallo en serie ${fp.firstFailurePosition}`,
      detail: `Fallo en la serie ${fp.firstFailurePosition} de ${setCount} (no la última). Eso indica carga excesiva, no fatiga normal. Baja ${increments.small} ${unit}.`,
      color: "orange", emoji: "⚠️",
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
