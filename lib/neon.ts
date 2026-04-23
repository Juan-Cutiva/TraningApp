import { neon } from "@neondatabase/serverless";
import { BASE_ROUTINES } from "./base-routines";

export const sql = neon(process.env.DATABASE_URL!);

/**
 * Module-level cache so we only run CREATE TABLE / ALTER once per process.
 * Each Vercel serverless instance re-runs it on cold start, which is fine —
 * the alternative (running on every request) was adding 2 round-trips of
 * latency to every API call.
 */
let initPromise: Promise<void> | null = null;

async function doInit(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      active        BOOLEAN DEFAULT true,
      role          TEXT DEFAULT 'user',
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `;

  // Add role column if it doesn't exist yet (safe migration)
  await sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
  `;

  // Generic key/value store for app-wide config that lives on the server.
  // Used today for 'base_routines' — the editable-by-admin template that the
  // client pulls on "Cargar rutinas base". Keys are namespaced strings.
  await sql`
    CREATE TABLE IF NOT EXISTS app_config (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT now(),
      updated_by  TEXT
    )
  `;

  // Seed the bundled BASE_ROUTINES into app_config on first boot so the DB
  // is authoritative from day 1. The sentinel key `base_routines_seeded`
  // prevents re-seeding after an admin DELETEs to intentionally reset back
  // to the bundled fallback (both keys get removed together by the DELETE
  // endpoint, so a subsequent cold start won't re-seed automatically).
  const seededRows = (await sql`
    SELECT key FROM app_config WHERE key = 'base_routines_seeded' LIMIT 1
  `) as { key: string }[];
  if (seededRows.length === 0) {
    await sql`
      INSERT INTO app_config (key, value, updated_at, updated_by)
      VALUES ('base_routines', ${JSON.stringify(BASE_ROUTINES)}::jsonb, now(), 'system-seed')
      ON CONFLICT (key) DO NOTHING
    `;
    await sql`
      INSERT INTO app_config (key, value, updated_at, updated_by)
      VALUES ('base_routines_seeded', 'true'::jsonb, now(), 'system-seed')
      ON CONFLICT (key) DO NOTHING
    `;
  }
}

/**
 * Idempotent, cached schema init. Concurrent callers share the same promise
 * so we never race two CREATE TABLEs against each other.
 */
export async function initDB(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = doInit().catch((err) => {
    // Reset the cache so the next request retries instead of getting stuck
    // on a permanent failed promise.
    initPromise = null;
    throw err;
  });
  return initPromise;
}
