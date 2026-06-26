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

### Single-file frontend — `src/App.jsx` (~1770 lines)
The entire UI is one file by deliberate design. **Read the whole file before editing** to understand component boundaries. Layout, top to bottom:
- **Helpers**: `dateKey`, `todayStr`, `offsetDate`, `weekOf`, `monthGrid`, `daysUntil`, `phaseFor`, `actualKm`, `plannedKm`, `fmtKm`. All date keys are `YYYY-MM-DD` strings — use these helpers, not moment.js/date-fns (native `Date` keeps the bundle tiny).
- **Constants**: `PLAN_WEEKS` (hardcoded 17-week plan, `[Mon…Sun]` per week — race Sun 25 Oct 2026, week 1 starts Mon 29 Jun 2026), `TIPS` + `getTip` (per-workout effort guidance), `ZONE` + `getZone` (Z1–Z4 training-zone pills for running sessions), `ALTS` (alternative workouts), `SHEET_OPTIONS` (the "What are you doing today?" grid), `FEELINGS` (1–5 rating scale), `WORKOUT_OPTIONS`, `PHASES`/`DELOAD_WEEKS` (Journey view), and `C` (inline color tokens — there are no CSS files; all styling is inline, keyframe animations are injected via inline `<style>` tags).
- **Screens** (`screen` state: `"main"` | `"setup"` | `"editday"` | `"coach"`): `SetupScreen` (also holds the export/restore backup UI and athlete name), `EditDayScreen`, `CoachScreen` (full-screen chat).
- **Views** (within `"main"`, `view` state: `"today"` | `"week"` | `"month"` | `"journey"`): `TodayView`, `WeekView`, `MonthView`, `JourneyView`.
- **`App`**: root — loads/persists state, owns `screen`/`view` navigation. There is no router; all navigation is state transitions (no `<Link>`/`useNavigate`).

### Interaction patterns
- **`useSwipe(onLeft, onRight)`** hook powers horizontal swipe navigation (50px threshold) in Today/Week/Month views; day/week/month changes also run a `slideInLeft`/`slideInRight` animation keyed on the offset state.
- **Bottom sheet workout switcher**: the ⇅ button on the Today card opens a bottom sheet with a `SHEET_OPTIONS` grid ("Run", "HIIT", "Yoga", "Rest day", "Other"…). "Run" opens the editor, "Rest" clears the day, "Other" prompts for free text, the rest set `workout` to `"<emoji> <label>"`.
- **Notes** on the Today card are collapsible (tap to expand a textarea).

### Storage model
`localStorage` under key `SK = "marathon-v8"`, stored as one JSON blob: `{ name, athleteName, raceDate, startDate, plan }`, where `name` is the race name and `plan` maps date keys to `{ workout, km, kmDone, completed, notes, feeling }`. **If you change the data model significantly, bump `SK` (`marathon-v8` → `v9`)** to avoid loading stale-shaped data. `actualKm(e)` reads `kmDone` falling back to `km`. Per-day coach conversations are stored separately under `coach-YYYY-MM-DD` keys (also included in export/restore). On first run with no stored data, `buildDefaultPlan()` seeds the full 17-week plan.

### Backup (export / restore)
`SetupScreen` (the ⚙ settings screen, edit mode) exports a JSON file containing the `marathon-v8` blob plus every `coach-*` conversation, and can restore from such a file (replacing current data, then reloading). This is the only persistence beyond `localStorage` — there is no server-side storage of athlete data.

### AI coach — `api/coach.js` + `CoachScreen`
Vercel **Node.js** serverless function (not an Edge Function). The full-screen `CoachScreen` (opened via "Ask the coach" on the Today card) holds a persistent per-day chat: it loads/saves the thread under `coach-<viewKey>`, POSTs training context + the full `messages` array to `/api/coach`, and streams Claude's reply back as `text/plain` chunks read via a `ReadableStream` reader and appended live into the chat bubble. "New conversation" clears that day's history.
- Model is `MODEL` at the top of the file (`claude-sonnet-4-6`; bump to `claude-opus-4-8` for max quality).
- **Key handling**: `ANTHROPIC_API_KEY` is read **only** server-side. It must NOT have a `VITE_` prefix — any `VITE_`-prefixed var is bundled into the public client JS and would leak the key. Set it in `.env` locally and in Vercel project env vars in production.
- Context sent: the coach gets the **full plan in both directions** — every completed session (history) and every remaining planned session through race day (the road ahead) — plus the viewed day's details, week/month km totals, days-until-race, training phase, and the athlete's name. The whole context lives in the **system prompt** (via `buildContextBlock`) so it persists across the conversation. To keep the prompt bounded late in the block, completed sessions older than `FULL_DETAIL_DAYS` (14) are summarised to one line (`date: km emoji`) while the last 2 weeks keep full detail. The client assembles `history`/`upcoming` in `buildCoachContext` (`src/App.jsx`); the server formats them in `buildContextBlock` (`api/coach.js`).

## Conventions
- Touch targets ≥44px; `WebkitTapHighlightColor:"transparent"` on interactive elements; `env(safe-area-inset-*)` for the iPhone notch/home indicator.
- The training plan is hardcoded in `PLAN_WEEKS`; a multi-athlete version would move it to per-user storage or a database.
