import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { initDB, sql } from "@/lib/neon";

const ALLOWED_EMAIL = "juandavidcutiva.jdc@gmail.com";
const ALLOWED_PASSWORD = "Ryzen97950x*";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * GET /api/auth/seed
 * One-time endpoint: creates the initial user if the table is empty.
 * Safe to call multiple times — only inserts if no users exist.
 */
export async function GET() {
  try {
    await initDB();

    const existing = await sql`SELECT id FROM users LIMIT 1`;

    if (existing.length > 0) {
      return NextResponse.json({ seeded: false, message: "Usuario ya existe." });
    }

    const passwordHash = sha256(ALLOWED_PASSWORD);

    await sql`
      INSERT INTO users (email, password_hash, active, role)
      VALUES (${ALLOWED_EMAIL}, ${passwordHash}, true, 'admin')
    `;

    return NextResponse.json({ seeded: true, message: "Usuario creado correctamente." });
  } catch (err) {
    console.error("[seed]", err);
    return NextResponse.json(
      { error: "Error al crear usuario." },
      { status: 500 }
    );
  }
}
