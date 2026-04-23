import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/client-error
 *
 * Collects client-side error reports from the React ErrorBoundary and
 * unhandled promise rejections. We don't persist them to the DB — instead
 * they go to `console.error` which Vercel funnels into function logs, so
 * they show up in the dashboard without adding a logging-as-a-service
 * dependency.
 *
 * Rate-limited to keep a broken client from spamming logs.
 */

interface IncomingError {
  message?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  context?: Record<string, unknown>;
}

const MAX_FIELD_LEN = 4000;

function truncate(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  return s.length > MAX_FIELD_LEN ? s.slice(0, MAX_FIELD_LEN) + "…" : s;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const gate = checkRateLimit(`client-error:${ip}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!gate.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: IncomingError = {};
  try {
    body = (await req.json()) as IncomingError;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const payload = {
    message: truncate(body.message) ?? "(no message)",
    stack: truncate(body.stack),
    componentStack: truncate(body.componentStack),
    url: truncate(body.url),
    userAgent: truncate(body.userAgent),
    timestamp: truncate(body.timestamp) ?? new Date().toISOString(),
    context: body.context,
    ip,
  };

  // Vercel captures this in function logs (Observability tab). For real
  // production we'd ship this to Sentry; for now server logs are sufficient
  // visibility.
  // eslint-disable-next-line no-console
  console.error("[client-error]", JSON.stringify(payload));

  return NextResponse.json({ ok: true });
}
