import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { initDB, sql } from "@/lib/neon";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    await initDB();

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Faltan credenciales." },
        { status: 400 }
      );
    }

    const passwordHash = sha256(password);

    const rows = await sql`
      SELECT id, active, role
      FROM users
      WHERE email = ${email.trim().toLowerCase()}
        AND password_hash = ${passwordHash}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Correo o contraseña incorrectos." },
        { status: 401 }
      );
    }

    const user = rows[0];

    if (!user.active) {
      return NextResponse.json(
        { error: "subscription_inactive" },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, userId: user.id, role: user.role });
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json(
      { error: "Error del servidor. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
