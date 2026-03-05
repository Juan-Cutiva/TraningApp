import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/neon";

/** Returns true if the request comes from a user with role='admin' */
export async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const email = req.headers.get("x-admin-email");
  if (!email) return false;

  try {
    const rows = await sql`
      SELECT role FROM users
      WHERE email = ${email.trim().toLowerCase()} AND active = true
      LIMIT 1
    `;
    return rows.length > 0 && rows[0].role === "admin";
  } catch {
    return false;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "No autorizado." }, { status: 403 });
}
