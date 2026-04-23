# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build (TypeScript errors are ignored by config)
npm run lint     # Run ESLint
npm start        # Start production server
```

No test framework is configured. Language throughout the app UI is Spanish.

## Architecture

**Stack:** Next.js 16 App Router (React 19) + TypeScript + Dexie.js (IndexedDB) + Neon serverless Postgres (auth only) + shadcn/ui (Radix) + Tailwind CSS v4.

Cuti Traning is a fitness PWA. Training data is **fully client-side** in IndexedDB via Dexie — the app works offline. A small Neon Postgres backend exists **only** for authenticated access control (login, subscription validation, admin-managed users). There is no server-side storage of workouts, routines, or user training data.

### Two distinct data layers

1. **Training data — `lib/db.ts` (Dexie / IndexedDB, client-only).** Central file containing all TypeScript interfaces, the Dexie database class, seed logic, and all DB helpers. Key tables: `routines`, `workoutLogs`, `personalRecords`, `bodyWeight`, `weightGoals`, `userSettings`, `goals`. 1RM calculations (Epley, Brzycki, etc.) live here. Components read reactively via `dexie-react-hooks` (`useLiveQuery`).

2. **Auth data — `lib/neon.ts` + `app/api/` (Neon Postgres, server-side).** Single `users` table (`email`, `password_hash`, `active`, `role`). Accessed only through the API routes under `app/api/auth/*` and `app/api/admin/*`.

### Auth flow — `lib/auth.ts` + `components/auth/auth-provider.tsx`

`AuthProvider` wraps the whole app in `app/layout.tsx` and gates rendering behind an `AuthState` union (`loading | unauthenticated | authenticated | inactive | grace_expired`). All session state lives in localStorage under these keys: `gym_session_uid`, `gym_last_validated`, `gym_user_email`, `gym_user_role`.

- Login: `POST /api/auth/login` → returns `"ok" | "invalid_credentials" | "subscription_inactive" | "server_error"`.
- Revalidation: `checkSubscription()` runs on every mount. If ≥ 30 days since `gym_last_validated`, hits `POST /api/auth/validate`. A 2-day offline grace window (32 days total) returns `"grace"`; past that, `"grace_expired"` and the user is logged out.
- Admin: role stored in `users.role` (`'admin' | 'user'`). Admin API routes in `app/api/admin/*` verify via the `x-admin-email` header using `app/api/admin/_verify.ts` → `verifyAdmin()`. Client calls must include headers from `adminHeaders()`. Admin UI is `components/settings/admin-users-panel.tsx`, only shown when `isAdmin()` is true.

When touching auth, remember the whole gate is client-evaluated — server routes must independently re-verify (see `_verify.ts`), never trust the header alone for mutations.

### RPE progression engine — `lib/rpe-engine.ts`

Core training logic beyond simple logging. Analyzes each exercise's completed sets (actual reps vs target range, RPE trend, rep drop-off, failure position, muscle-size tier, etc.) and returns a typed `RPERecommendation` for the next session. Recommendations are **persisted** onto `WorkoutExerciseLog.lastRecommendation` in Dexie so they appear at the start of the next workout. Evidence-based (Schoenfeld, Helms, Zourdos, Refalo, ACSM); header comment documents the factors. Do not modify thresholds without reading that header.

### Routing & components

Standard Next.js App Router under `app/`: dashboard (`/`), routines, workout/[id] (active workout), history, personal-records, stats, body-weight, settings. API routes in `app/api/` (auth + admin). `app/callback/` handles Spotify OAuth.

`components/` mirrors page routes (`dashboard/`, `workout/`, `routines/`, `history/`, `personal-records/`, `body-weight/`, `settings/`). `components/ui/` is shadcn/ui primitives. `components/auth/` holds the provider + login/subscription gating. `components/spotify/` is the optional music widget.

Notable complex components: `components/workout/workout-mode.tsx` (active workout + finished screen), `components/dashboard/dashboard-content.tsx` (weekly comparison), `components/history/history-content.tsx` (PDF export via jsPDF), `components/routines/routines-content.tsx`.

### Seed routines

`lib/base-routines.ts` exports `BASE_ROUTINES` — the default weekly template inserted on first launch by the seed logic in `lib/db.ts`.

### Spotify integration

Optional. Requires `SPOTIFY_REDIRECT_URI` in `.env.local`. OAuth callback at `/callback`. Wrapped in `SpotifyProvider` in `app/layout.tsx`.

## Environment

`.env.local` must define:

- `DATABASE_URL` — Neon Postgres connection string (sa-east-1). Required for auth.
- `SPOTIFY_REDIRECT_URI` — Only needed if using the Spotify widget.

## Key conventions

- Path alias `@/*` maps to project root (see `tsconfig.json`).
- `next.config.mjs` sets `typescript.ignoreBuildErrors: true` **and** `images.unoptimized: true` — TS errors will not block builds, so `npm run lint` is the only static check in CI-like usage. Still prefer fixing TS errors.
- `dayOfWeek` on routines: `0=Sunday … 6=Saturday`, `null`=unassigned.
- RPE values on sets: `"easy" | "normal" | "hard" | "failure"` (mapped to RIR in `rpe-engine.ts`).
- Weight/reps inputs: accept comma as decimal separator in the UI, normalized to dot before persisting.
- UI components follow shadcn/ui patterns (Radix primitives + Tailwind, `cn()` helper from `lib/utils.ts`).
- **No volume metric anywhere.** `totalVolume = weight × reps` was explicitly removed from all UI, share text, and PDF export. Do not reintroduce it when adding features.
