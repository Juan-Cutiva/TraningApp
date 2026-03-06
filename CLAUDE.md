# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build (TypeScript errors are ignored by config)
npm run lint     # Run ESLint
npm start        # Start production server
```

No test framework is configured.

## Architecture

**Stack:** Next.js App Router + TypeScript + Dexie.js (IndexedDB) + shadcn/ui + Tailwind CSS v4

This is a **100% client-side** fitness PWA. There is no backend — all data lives in the browser's IndexedDB via Dexie.js. The app works fully offline.

### Data layer: `lib/db.ts`
Central file containing all TypeScript interfaces, the Dexie database class, and all database helper functions. Key tables:
- `routines` — weekly training routines with exercises
- `workoutLogs` — completed workouts with per-set data
- `personalRecords` — PR tracking (weight, reps, 1RM)
- `bodyWeight` / `weightGoals` — body weight history and targets
- `userSettings` — app preferences
- `goals` — training goals

1RM calculations use scientific formulas (Epley, Brzycki, etc.) implemented in this file.

### Routing: `app/`
Standard Next.js App Router. Pages: dashboard (`/`), routines, workout/[id] (active workout), history, personal-records, stats, body-weight, settings. The `app/callback/` route handles Spotify OAuth.

### Components: `components/`
Feature folders mirror page routes (`dashboard/`, `workout/`, `routines/`, etc.). `components/ui/` contains shadcn/ui base components. `components/spotify/` handles optional Spotify integration.

### Spotify integration
Optional music feature using Spotify Web API. Requires `SPOTIFY_REDIRECT_URI` in `.env.local`. OAuth callback handled at `/callback`.

## Key conventions

- Path alias `@/*` maps to project root
- `next.config.mjs` has `typescript.ignoreBuildErrors: true` — TypeScript errors won't block builds
- UI components follow shadcn/ui patterns (Radix UI primitives + Tailwind)
- `dayOfWeek` in routines: 0=Sunday … 6=Saturday, `null`=unassigned
- RPE values in sets: `"easy" | "normal" | "hard" | "failure"`
