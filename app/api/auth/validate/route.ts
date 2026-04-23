import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/neon";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/auth/validate
 *
 * Returns `{ active: boolean }` for a given email. The client calls this
 * once every 30 days of active session to confirm the subscription is
 * still valid. Rate-limited to prevent user enumeration (`active: false`
 * vs `active: true` is the only signal an attacker would extract).
 */
export async function POST(req: NextRequest) {
  // 30 requests per IP per minute — plenty of headroom for a legitimate
  // client that checks once a month, while making scripted enumeration
  // of a user list costly.
  const ip = getClientIp(req);
  const gate = checkRateLimit(`validate:${ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(gate.retryAfter) },
      },
    );
  }

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
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
