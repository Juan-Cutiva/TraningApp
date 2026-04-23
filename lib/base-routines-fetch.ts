import { BASE_ROUTINES } from "./base-routines";
import type { Routine } from "./db";

export type BaseRoutineTemplate = Omit<Routine, "id" | "createdAt" | "updatedAt">;

export interface BaseRoutinesResponse {
  source: "database" | "bundled" | "bundled-fallback";
  routines: BaseRoutineTemplate[];
  updatedAt?: string;
  updatedBy?: string | null;
  error?: string;
}

/**
 * Fetch the latest base routines. Strategy:
 *   1. Try the server (`/api/base-routines`) so admin edits reach every client.
 *   2. On any failure (offline, 500, timeout), fall back to the bundled
 *      `BASE_ROUTINES` so the user can still seed a fresh install without
 *      an internet connection.
 *
 * The returned `source` field tells the caller where the data came from so
 * the UI can communicate it ("Cargado desde servidor" vs "Usando local").
 */
export async function fetchBaseRoutines(): Promise<BaseRoutinesResponse> {
  if (typeof window === "undefined") {
    // On the server (shouldn't normally run, but safe guard) we'd call the
    // DB directly — here we just return bundled so the module stays pure.
    return { source: "bundled", routines: BASE_ROUTINES };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("/api/base-routines", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`http_${res.status}`);
    const data = (await res.json()) as BaseRoutinesResponse;

    if (!Array.isArray(data.routines) || data.routines.length === 0) {
      return { source: "bundled-fallback", routines: BASE_ROUTINES };
    }
    return data;
  } catch {
    return { source: "bundled-fallback", routines: BASE_ROUTINES };
  }
}

/**
 * Admin-only: save a new base-routines payload to the server. Returns the
 * parsed error message on failure (for toast display).
 */
export async function saveBaseRoutines(
  routines: BaseRoutineTemplate[],
  adminHeaders: HeadersInit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/base-routines", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ routines }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}

/** Admin-only: reset to bundled defaults by deleting the DB row. */
export async function resetBaseRoutines(
  adminHeaders: HeadersInit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/base-routines", {
      method: "DELETE",
      headers: adminHeaders,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network_error" };
  }
}
