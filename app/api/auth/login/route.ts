import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { initDB, sql } from "@/lib/neon";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function POST(req: NextRequest) {
  // 10 login attempts per IP per minute. Enough for a legitimate retry
  // ("typo in password") but costly for brute-force scripts.
  const ip = getClientIp(req);
  const gate = checkRateLimit(`login:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera unos minutos." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
    );
  }

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
