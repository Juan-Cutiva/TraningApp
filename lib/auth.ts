const SESSION_KEY = "gym_session_uid";
const LAST_VALIDATED_KEY = "gym_last_validated";
const USER_EMAIL_KEY = "gym_user_email";
const USER_ROLE_KEY = "gym_user_role";

const VALIDATION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;          // +2 days grace if offline

// ─── Session helpers ────────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(SESSION_KEY) !== null;
}

export function getSessionEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_EMAIL_KEY);
}

export function getSessionRole(): string {
  if (typeof window === "undefined") return "user";
  return localStorage.getItem(USER_ROLE_KEY) ?? "user";
}

export function isAdmin(): boolean {
  return getSessionRole() === "admin";
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LAST_VALIDATED_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
  localStorage.removeItem(USER_ROLE_KEY);
}

function saveSession(userId: number, email: string, role: string): void {
  localStorage.setItem(SESSION_KEY, String(userId));
  localStorage.setItem(USER_EMAIL_KEY, email.trim().toLowerCase());
  localStorage.setItem(USER_ROLE_KEY, role);
  localStorage.setItem(LAST_VALIDATED_KEY, new Date().toISOString());
}

// ─── Login ──────────────────────────────────────────────────────────────────

/**
 * Calls the server-side login API.
 * Returns "ok", "invalid_credentials", "subscription_inactive", or "server_error".
 */
export async function login(
  email: string,
  password: string
): Promise<"ok" | "invalid_credentials" | "subscription_inactive" | "server_error"> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      saveSession(data.userId, email, data.role ?? "user");
      return "ok";
    }

    if (res.status === 403 && data.error === "subscription_inactive") {
      return "subscription_inactive";
    }

    if (res.status === 401) {
      return "invalid_credentials";
    }

    return "server_error";
  } catch {
    return "server_error";
  }
}

// ─── 30-day subscription validation ─────────────────────────────────────────

export type ValidationResult =
  | "valid"           // session OK, no need to validate yet
  | "revalidated"     // just re-validated with server — still active
  | "inactive"        // server says subscription is inactive
  | "grace"           // offline but within 2-day grace window
  | "grace_expired";  // offline AND grace period also expired

/**
 * Called on every app load.
 * - If < 30 days since last validation → "valid" (fully offline)
 * - If ≥ 30 days → hits /api/auth/validate
 *   - active=true  → "revalidated"
 *   - active=false → "inactive"
 *   - network error + within 32 days → "grace"
 *   - network error + beyond 32 days → "grace_expired"
 */
export async function checkSubscription(): Promise<ValidationResult> {
  if (!isAuthenticated()) return "valid";

  const raw = localStorage.getItem(LAST_VALIDATED_KEY);
  if (!raw) {
    return await revalidate();
  }

  const lastValidated = new Date(raw).getTime();
  const now = Date.now();
  const elapsed = now - lastValidated;

  if (elapsed < VALIDATION_INTERVAL_MS) {
    return "valid";
  }

  return await revalidate(elapsed);
}

async function revalidate(elapsed?: number): Promise<ValidationResult> {
  const email = getSessionEmail();
  if (!email) {
    logout();
    return "inactive";
  }

  try {
    const res = await fetch("/api/auth/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) throw new Error("server_error");

    const data = await res.json();

    if (!data.active) {
      logout();
      return "inactive";
    }

    localStorage.setItem(LAST_VALIDATED_KEY, new Date().toISOString());
    return "revalidated";
  } catch {
    let elapsedMs = elapsed;
    if (elapsedMs === undefined) {
      const raw = localStorage.getItem(LAST_VALIDATED_KEY);
      const parsedTs = raw ? new Date(raw).getTime() : NaN;
      // Corrupt or missing timestamp → treat as fully expired so we log out
      // instead of silently granting grace (which is what happened before
      // because `NaN < anything` is always false, so the "grace" branch
      // never fired and neither did the logout).
      if (!Number.isFinite(parsedTs)) {
        logout();
        return "grace_expired";
      }
      elapsedMs = Date.now() - parsedTs;
    }

    if (elapsedMs < VALIDATION_INTERVAL_MS + GRACE_PERIOD_MS) {
      return "grace";
    }

    logout();
    return "grace_expired";
  }
}

// ─── Admin helpers ───────────────────────────────────────────────────────────

/** Returns headers required for admin API calls */
export function adminHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-admin-email": getSessionEmail() ?? "",
  };
}
