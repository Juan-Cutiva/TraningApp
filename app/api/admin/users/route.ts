import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { initDB, sql } from "@/lib/neon";
import { verifyAdmin, unauthorized } from "../_verify";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** GET /api/admin/users — list all users */
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return unauthorized();

  await initDB();

  const rows = await sql`
    SELECT id, email, active, role, created_at
    FROM users
    ORDER BY created_at ASC
  `;

  return NextResponse.json({ users: rows });
}

/** POST /api/admin/users — create a new user */
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return unauthorized();

  await initDB();

  const { email, password, active = true, role = "user" } = await req.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email y contraseña son obligatorios." },
      { status: 400 }
    );
  }

  const passwordHash = sha256(password);

  try {
    const rows = await sql`
      INSERT INTO users (email, password_hash, active, role)
      VALUES (${email.trim().toLowerCase()}, ${passwordHash}, ${active}, ${role})
      RETURNING id, email, active, role, created_at
    `;
    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese correo." },
        { status: 409 }
      );
    }
    console.error("[POST /api/admin/users]", err);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
