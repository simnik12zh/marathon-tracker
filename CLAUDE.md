# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173 — serves the UI only
npm run build      # production build → dist/
npm run preview    # preview the production build
npx vercel dev     # serves the UI AND the /api serverless function (needed for the AI coach)
```

There are no test or lint scripts. `npm run dev` cannot run `/api/coach` because Vite does not execute serverless functions — use `npx vercel dev` (with `ANTHROPIC_API_KEY` in `.env`) to exercise the coach end-to-end locally.

## Architecture

Mobile-first (iPhone) marathon training app: React 18 + Vite frontend, one Vercel serverless function for the AI coach. No backend database — all athlete data lives in `localStorage`. Installable as a PWA (`public/manifest.json` + `icon-192/512/1024.png`, a running-figure icon; iOS meta tags in `index.html`). Deployed on Vercel (auto-detects Vite, no config); pushes to `main` auto-deploy.

### Single-file frontend — `src/App.jsx` (~2200 lines)
The entire UI is one file by deliberate design. **Read the whole file before editing** to understand component boundaries. Layout, top to bottom:
- **Helpers**: `dateKey`, `todayStr`, `offsetDate`, `weekOf`, `monthGrid`, `daysUntil`, `phaseFor`, `actualKm`, `plannedKm`, `origKm`, `fmtKm`. All date keys are `YYYY-MM-DD` strings — use these helpers, not moment.js/date-fns (native `Date` keeps the bundle tiny). **Three km accessors, don't mix them up**: `actualKm(e)` = logged distance (`kmDone`, else `km`, only when completed); `plannedKm(e)` = the day's *current* planned/target km (`e.km`, used for the day card + per-row display); `origKm(e)` = the *fixed original-plan* km (`e.plannedKm`, falls back to `e.km`) — used for the weekly/monthly/journey **planned totals** so they don't drop when a session is swapped to a non-running workout.
- **Constants**: `PLAN_WEEKS` (hardcoded 17-week plan, `[Mon…Sun]` per week — race Sun 25 Oct 2026, week 1 starts Mon 29 Jun 2026; restructured around Ibiza Jul 10–15 and Tuscany Aug 22–Sep 5 breaks), `TIPS` + `getTip` (per-workout effort guidance — a semantic green/amber/red effort scale, deliberately NOT part of the pink/red brand palette), `ZONE` + `getZone` (Z1–Z4 training-zone pills for running sessions), `ALTS` (alternative workouts), `SHEET_OPTIONS` (the "What are you doing today?" grid), `FEELINGS` (1–5 rating scale), `MILESTONES` (celebration definitions, see below), `WORKOUT_OPTIONS`, `PHASES`/`DELOAD_WEEKS` (Journey view), and `C` (inline color tokens — a **pink/red palette**: `sage` is the mid-pink brand accent, `done`/`accent` is the red `#E8174A` for active/completed/primary states; `surface`/`sageLt`/`sageDk`/`doneLt` are legacy aliases mapped to pink/red tints). There are no CSS files; all styling is inline, keyframe animations are injected via inline `<style>` tags, plus one global `<style>` injected once in `App` (prefers-reduced-motion neutralizer, `:focus-visible` ring, `celebFadeIn`).
- **Shared components**: `WorkoutSheet` (the bottom-sheet workout switcher, used by both `TodayView` and `WeekView` — takes a `dateKey`), `TabIcon` (bottom-nav line icons), `TipCard`, `KmStepper`, `KmBig`, `Chk`, `NavArrow`.
- **Screens** (`screen` state: `"main"` | `"setup"` | `"editday"` | `"coach"`): `SetupScreen` (also holds the export/restore backup UI and athlete name), `EditDayScreen`, `CoachScreen` (full-screen chat).
- **Views** (within `"main"`, `view` state: `"today"` | `"week"` | `"month"` | `"journey"`): `TodayView`, `WeekView`, `MonthView`, `JourneyView`. Navigation between views is a **fixed bottom tab bar** (thumb-zone, not top tabs).
- **`App`**: root — loads/persists state, owns `screen`/`view` navigation and the milestone `celebration` overlay. There is no router; all navigation is state transitions (no `<Link>`/`useNavigate`). `updDay(dk,u)` is the single mutation path; `swapDays(a,b)` swaps two days' `workout`/`km`/`plannedKm` atomically (two sequential `updDay` calls would clobber each other via the stale `plan` closure).

### Interaction patterns
- **`useSwipe(onLeft, onRight)`** hook powers horizontal swipe navigation (50px threshold) in Today/Week/Month views; day/week/month changes also run a `slideInLeft`/`slideInRight` animation keyed on the offset state.
- **Workout switcher (`WorkoutSheet`)**: the ⇅ button opens a bottom sheet with a `SHEET_OPTIONS` grid ("Run", "HIIT", "Yoga", "Rest day", "Other"…). "Run" opens the editor, "Rest" clears the day, "Other" prompts for free text, the rest set `workout` to `"<emoji> <label>"`. Available on the Today card **and** on each WeekView day row.
- **WeekView day swap**: tapping a day *card* (not its ⇅) enters swap mode — first tap selects (sage highlight + "Tap another day to swap" banner + cancel pill), second tap on a different day swaps the two via `onSwapDays`, then flashes both rows (`swapFlash`) with a "✓ Workouts swapped" pill. The top **strip** cells still navigate to a day.
- **Milestone celebrations**: after a run is logged (a `completed:true` update with `kmDone>0`), `App.checkMilestones` fires the first not-yet-shown `MILESTONES` entry whose `check` passes, shown as a full-screen `celebration` overlay (auto-dismiss 4s / tap). Each fires once, gated by a `milestone-<id>` localStorage flag. Uses **synchronous** `localStorage` (not the async `storeGet/storeSet`) and reads the just-updated plan.
- **Confirmations & feedback**: unlogging a completed session shows an inline "Remove this log entry?" row inside the Today card (not a modal); restoring a backup sets a `sessionStorage` flag that surfaces a "Backup restored" toast after reload.
- **Notes** on the Today card are collapsible (tap to expand a textarea).
- **Chrome icons are inline SVG, not emoji** (settings gear, "Today" pill chevron, bottom-nav `TabIcon`) so iOS doesn't render them as coloured emoji.

### Storage model
`localStorage` under key `SK = "marathon-v12"`, stored as one JSON blob: `{ name, athleteName, raceDate, startDate, plan }`, where `name` is the race name and `plan` maps date keys to `{ workout, km, plannedKm, kmDone, completed, notes, feeling }`. `plannedKm` is the **fixed original plan distance** — set once by `buildDefaultPlan` and never written by `updDay`/the sheet/the editor, so planned totals stay constant after edits (read via `origKm`). **If you change the data model significantly, bump `SK` (e.g. `marathon-v12` → `v13`)** to avoid loading stale-shaped data — code references the `SK` constant (including export/import), so only line 3 changes. Note: bumping reseeds and drops existing logged progress, so it's a destructive migration. `actualKm(e)` reads `kmDone` falling back to `km`. Per-day coach conversations are stored under `coach-YYYY-MM-DD` keys; one-time milestone flags under `milestone-<id>` keys. On first run with no stored data, `buildDefaultPlan()` seeds the full 17-week plan (plus three pre-week priming days).

### Backup (export / restore)
`SetupScreen` (the ⚙ settings screen, edit mode) exports a JSON file containing the `SK` blob plus every `coach-*` conversation, and can restore from such a file (replacing current data, then reloading). This is the only persistence beyond `localStorage` — there is no server-side storage of athlete data. (Milestone flags are not exported.)

### AI coach — `api/coach.js` + `CoachScreen`
Vercel **Node.js** serverless function (not an Edge Function). The full-screen `CoachScreen` (opened via "Ask the coach" on the Today card) holds a persistent per-day chat: it loads/saves the thread under `coach-<viewKey>`, POSTs training context + the full `messages` array to `/api/coach`, and streams Claude's reply back as `text/plain` chunks read via a `ReadableStream` reader and appended live into the chat bubble. "New conversation" clears that day's history.
- Model is `MODEL` at the top of the file (`claude-sonnet-4-6`; bump to `claude-opus-4-8` for max quality).
- **Key handling**: `ANTHROPIC_API_KEY` is read **only** server-side. It must NOT have a `VITE_` prefix — any `VITE_`-prefixed var is bundled into the public client JS and would leak the key. Set it in `.env` locally and in Vercel project env vars in production.
- Context sent: the coach gets the **full plan in both directions** — every completed session (history) and every remaining planned session through race day (the road ahead) — plus the viewed day's details, week/month km totals, days-until-race, training phase, and the athlete's name. The whole context lives in the **system prompt** (via `buildContextBlock`) so it persists across the conversation. To keep the prompt bounded late in the block, completed sessions older than `FULL_DETAIL_DAYS` (14) are summarised to one line (`date: km emoji`) while the last 2 weeks keep full detail. The client assembles `history`/`upcoming` in `buildCoachContext` (`src/App.jsx`); the server formats them in `buildContextBlock` (`api/coach.js`).

## Conventions
- Touch targets ≥44px; `WebkitTapHighlightColor:"transparent"` on interactive elements; `env(safe-area-inset-*)` for the iPhone notch/home indicator. `index.html` sets `viewport-fit=cover` — required for the safe-area insets to report non-zero in the standalone PWA.
- Respect `prefers-reduced-motion` (the global injected `<style>` neutralizes animations/transitions under it); keep new interactive elements keyboard-focusable (they inherit the global `:focus-visible` ring) and prefer real `<button>`s with `aria-label`s over clickable `<div>`s.
- Use inline SVG (not emoji) for UI chrome so iOS keeps it monochrome; emoji are fine for expressive content (workout glyphs, feelings, milestone overlays).
- The training plan is hardcoded in `PLAN_WEEKS`; a multi-athlete version would move it to per-user storage or a database. When restructuring the plan, also check `PHASES` and `DELOAD_WEEKS` (Journey view) stay in sync, and bump `SK` if you want existing devices to pick up the change.
