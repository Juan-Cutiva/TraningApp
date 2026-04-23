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
  name: unknown;
  dayOfWeek: unknown;
  exercises: unknown;
}

function validateRoutines(payload: unknown): { ok: true; value: IncomingRoutine[] } | { ok: false; error: string } {
  if (!Array.isArray(payload)) {
    return { ok: false, error: "El payload debe ser un array de rutinas." };
  }
  if (payload.length === 0) {
    return { ok: false, error: "Debe haber al menos una rutina." };
  }
  for (let i = 0; i < payload.length; i++) {
    const r = payload[i] as IncomingRoutine;
    if (typeof r?.name !== "string" || !r.name.trim()) {
      return { ok: false, error: `Rutina #${i + 1}: nombre inválido.` };
    }
    if (
      r.dayOfWeek !== null &&
      (typeof r.dayOfWeek !== "number" || r.dayOfWeek < 0 || r.dayOfWeek > 6)
    ) {
      return { ok: false, error: `Rutina "${r.name}": dayOfWeek inválido.` };
    }
    if (!Array.isArray(r.exercises)) {
      return { ok: false, error: `Rutina "${r.name}": exercises debe ser array.` };
    }
  }
  return { ok: true, value: payload as IncomingRoutine[] };
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
