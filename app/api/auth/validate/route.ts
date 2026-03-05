import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/neon";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ active: false }, { status: 400 });
    }

    const rows = await sql`
      SELECT active
      FROM users
      WHERE email = ${email.trim().toLowerCase()}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ active: false });
    }

    return NextResponse.json({ active: rows[0].active });
  } catch (err) {
    console.error("[validate]", err);
    // Return error so caller can apply grace period logic
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 }
    );
  }
}
