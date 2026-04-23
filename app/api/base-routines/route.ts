import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/neon";
import { verifyAdmin, unauthorized } from "@/app/api/admin/_verify";
import { BASE_ROUTINES } from "@/lib/base-routines";

/**
 * Base routines API — the template used by "Cargar rutinas base" in Settings.
 *
 * Storage: single row in `app_config` with key='base_routines'. The value is
 * a JSONB array matching `Omit<Routine, "id" | "createdAt" | "updatedAt">[]`.
 * If the row doesn't exist (fresh DB, or admin cleared it), GET returns the
 * bundled default `BASE_ROUTINES` so the app still works.
 *
 * GET is public — any authenticated client can read the template.
 * POST requires admin role (via `x-admin-email` header → verifyAdmin).
 */

const CONFIG_KEY = "base_routines";

interface ConfigRow {
  value: unknown;
  updated_at: string;
  updated_by: string | null;
}

// ─── GET — return latest base routines (DB or bundled fallback) ──────────────

export async function GET() {
  try {
    await initDB();
    const rows = (await sql`
      SELECT value, updated_at, updated_by
      FROM app_config
      WHERE key = ${CONFIG_KEY}
      LIMIT 1
    `) as ConfigRow[];

    if (rows.length > 0 && Array.isArray(rows[0].value)) {
      return NextResponse.json({
        source: "database",
        updatedAt: rows[0].updated_at,
        updatedBy: rows[0].updated_by,
        routines: rows[0].value,
      });
    }

    // No admin override stored yet — serve the bundled defaults so the app is
    // usable out of the box.
    return NextResponse.json({
      source: "bundled",
      routines: BASE_ROUTINES,
    });
  } catch (err) {
    console.error("GET /api/base-routines failed:", err);
    // On DB failure, still return the bundled defaults rather than an error —
    // clients need this endpoint to succeed to proceed with onboarding.
    return NextResponse.json({
      source: "bundled-fallback",
      routines: BASE_ROUTINES,
      error: "database_unreachable",
    });
  }
}

// ─── POST — admin updates the base routines template ─────────────────────────

interface IncomingRoutine {
  name: string;
  dayOfWeek: number | null;
  exercises: IncomingExercise[];
}

interface IncomingExercise {
  id: string;
  name: string;
  muscleGroup: string;
  sets: number;
  reps: number | string;
  targetWeight: number;
  unit: string;
  restSeconds: number;
  supersetId?: string;
  equipmentId?: string;
}

/**
 * Strip keys we don't expect, bound lengths, and reject anything that could
 * be misused. React escapes by default when rendering strings, so this is
 * defense-in-depth against unexpected sinks (PDF export, share text, etc.)
 * rather than a strict XSS filter.
 */
const NAME_MAX = 120;
const VALID_UNITS = new Set(["kg", "lb", "lbs", "otro"]);

function sanitizeString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  // Reject strings that look like HTML/script to harden any sink that
  // might not escape (PDF exports, share text, etc).
  if (/[<>]/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeNumber(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

function validateRoutines(
  payload: unknown,
): { ok: true; value: IncomingRoutine[] } | { ok: false; error: string } {
  if (!Array.isArray(payload)) {
    return { ok: false, error: "El payload debe ser un array de rutinas." };
  }
  if (payload.length === 0) {
    return { ok: false, error: "Debe haber al menos una rutina." };
  }
  if (payload.length > 50) {
    return { ok: false, error: "Demasiadas rutinas (máx 50)." };
  }

  const out: IncomingRoutine[] = [];
  for (let i = 0; i < payload.length; i++) {
    const r = payload[i] as Record<string, unknown>;
    const name = sanitizeString(r?.name, NAME_MAX);
    if (!name) {
      return { ok: false, error: `Rutina #${i + 1}: nombre inválido o demasiado largo.` };
    }
    const day =
      r.dayOfWeek === null || r.dayOfWeek === undefined
        ? null
        : sanitizeNumber(r.dayOfWeek, 0, 6);
    if (day === undefined) {
      return { ok: false, error: `Rutina "${name}": dayOfWeek inválido.` };
    }
    if (!Array.isArray(r.exercises)) {
      return { ok: false, error: `Rutina "${name}": exercises debe ser array.` };
    }
    if (r.exercises.length > 100) {
      return { ok: false, error: `Rutina "${name}": demasiados ejercicios (máx 100).` };
    }

    const exOut: IncomingExercise[] = [];
    for (let j = 0; j < r.exercises.length; j++) {
      const ex = r.exercises[j] as Record<string, unknown>;
      const exName = sanitizeString(ex?.name, NAME_MAX);
      const exMuscle = sanitizeString(ex?.muscleGroup, 30);
      const exUnit = typeof ex?.unit === "string" && VALID_UNITS.has(ex.unit) ? ex.unit : null;
      const exSets = sanitizeNumber(ex?.sets, 1, 99);
      const exRest = sanitizeNumber(ex?.restSeconds, 0, 1800);
      const exWeight = sanitizeNumber(ex?.targetWeight, 0, 10000);
      if (!exName || !exMuscle || !exUnit || exSets === null || exRest === null || exWeight === null) {
        return {
          ok: false,
          error: `Rutina "${name}" ejercicio #${j + 1}: campos inválidos.`,
        };
      }
      // Reps are either a number or a short string like "8-12" or "AMRAP"
      let reps: number | string;
      if (typeof ex.reps === "number") {
        const n = sanitizeNumber(ex.reps, 0, 200);
        if (n === null) {
          return { ok: false, error: `Rutina "${name}" ejercicio #${j + 1}: reps inválidas.` };
        }
        reps = n;
      } else {
        const s = sanitizeString(ex.reps, 20);
        if (!s) {
          return { ok: false, error: `Rutina "${name}" ejercicio #${j + 1}: reps inválidas.` };
        }
        reps = s;
      }
      const id = sanitizeString(ex?.id, 50) ?? `ex_${Date.now()}_${j}`;
      const supersetId = ex?.supersetId === undefined
        ? undefined
        : (sanitizeString(ex.supersetId, 50) ?? undefined);
      const equipmentId = ex?.equipmentId === undefined
        ? undefined
        : (sanitizeString(ex.equipmentId, 50) ?? undefined);
      exOut.push({
        id,
        name: exName,
        muscleGroup: exMuscle,
        sets: exSets,
        reps,
        targetWeight: exWeight,
        unit: exUnit,
        restSeconds: exRest,
        supersetId,
        equipmentId,
      });
    }

    out.push({ name, dayOfWeek: day ?? null, exercises: exOut });
  }
  return { ok: true, value: out };
}

export async function POST(req: NextRequest) {
  // Admin gate — verifyAdmin queries the users table to ensure the email
  // in the x-admin-email header really has role='admin'.
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "JSON inválido." },
      { status: 400 },
    );
  }

  const routines = (body as { routines?: unknown })?.routines;
  const validation = validateRoutines(routines);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 },
    );
  }

  const adminEmail = req.headers.get("x-admin-email")?.trim().toLowerCase() ?? null;

  try {
    await initDB();
    await sql`
      INSERT INTO app_config (key, value, updated_at, updated_by)
      VALUES (${CONFIG_KEY}, ${JSON.stringify(validation.value)}::jsonb, now(), ${adminEmail})
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by
    `;
    return NextResponse.json({ success: true, count: validation.value.length });
  } catch (err) {
    console.error("POST /api/base-routines failed:", err);
    return NextResponse.json(
      { error: "No se pudo guardar en la base de datos." },
      { status: 500 },
    );
  }
}

// ─── DELETE — admin resets to bundled defaults ───────────────────────────────

export async function DELETE(req: NextRequest) {
  const isAdmin = await verifyAdmin(req);
  if (!isAdmin) return unauthorized();

  try {
    await initDB();
    // Remove both the data row and the seeded sentinel so a fresh cold start
    // won't auto-re-seed the bundled defaults. The admin is explicitly asking
    // for the bundled fallback; respect that until they POST a new version.
    await sql`
      DELETE FROM app_config
      WHERE key IN ('base_routines', 'base_routines_seeded')
    `;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/base-routines failed:", err);
    return NextResponse.json(
      { error: "No se pudo restablecer." },
      { status: 500 },
    );
  }
}
