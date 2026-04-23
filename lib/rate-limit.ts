/**
 * In-memory sliding-window rate limiter for Next.js API routes.
 *
 * Purpose: prevent casual abuse of public endpoints (user-enumeration on
 * /auth/validate, login brute-force, etc.) without adding a Redis
 * dependency. The bucket lives in module scope so it's per serverless
 * instance — a determined attacker could still spray across many cold
 * starts, but for our use case the bar is "make it non-trivial".
 *
 * For production-grade rate limiting, swap this for Upstash Ratelimit
 * or Vercel KV. The API is kept simple so the upgrade is a drop-in.
 */

interface Bucket {
  hits: number[]; // timestamps (ms)
}

const buckets = new Map<string, Bucket>();

/**
 * Returns `{ ok: true, remaining, resetAt }` if the request fits under the
 * limit, or `{ ok: false, retryAfter }` if it's exceeded. Keys should be
 * scoped (e.g. `"validate:" + ip`) to avoid cross-endpoint interference.
 */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): { ok: true; remaining: number; resetAt: number } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const { limit, windowMs } = opts;
  const bucket = buckets.get(key) ?? { hits: [] };

  // Drop timestamps that fell out of the sliding window
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    buckets.set(key, bucket);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.hits.length),
    resetAt: now + windowMs,
  };
}

/** Extract the client IP from a NextRequest, with sensible fallbacks. */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Opportunistic cleanup: if the buckets Map grows too large (rare — means
 * many unique keys), drop entries whose windows fully elapsed. Called
 * periodically by callers that know they're on a hot path.
 */
export function pruneBuckets(maxAgeMs = 60_000) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0) {
      buckets.delete(key);
      continue;
    }
    const newest = bucket.hits[bucket.hits.length - 1];
    if (now - newest > maxAgeMs) buckets.delete(key);
  }
}
