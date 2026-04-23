import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

/** Creates the users + app_config tables if they don't exist */
export async function initDB(): Promise<void> {
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
}
