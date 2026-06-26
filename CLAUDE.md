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

Mobile-first (iPhone) marathon training app: React 18 + Vite frontend, one Vercel serverless function for the AI coach. No backend database — all athlete data lives in `localStorage`. Deployed on Vercel (auto-detects Vite, no config); pushes to `main` auto-deploy.

### Single-file frontend — `src/App.jsx` (~1170 lines)
The entire UI is one file by deliberate design. **Read the whole file before editing** to understand component boundaries. Layout, top to bottom:
- **Helpers**: `dateKey`, `todayStr`, `offsetDate`, `weekOf`, `monthGrid`, `daysUntil`, `phaseFor`, `actualKm`, `plannedKm`. All date keys are `YYYY-MM-DD` strings — use these helpers, not moment.js/date-fns (native `Date` keeps the bundle tiny).
- **Constants**: `PLAN_WEEKS` (hardcoded 17-week plan, `[Mon…Sun]` per week, Base→Build→Peak→Taper→Race), `TIPS`, `ALTS` (alternative workouts), `FEELINGS` (1–5 rating scale), `WORKOUT_OPTIONS`, and `C` (inline color tokens — there are no CSS files; all styling is inline).
- **Screens** (`screen` state: `"main"` | `"setup"` | `"editday"`): `SetupScreen`, `EditDayScreen`.
- **Views** (within `"main"`, `view` state: `"today"` | `"week"` | `"month"`): `TodayView`, `WeekView`, `MonthView`.
- **`App`**: root — loads/persists state, owns `screen`/`view` navigation. There is no router; all navigation is state transitions (no `<Link>`/`useNavigate`).

### Storage model
`localStorage` under key `SK = "marathon-v6"`, stored as one JSON blob: `{ name, raceDate, startDate, plan }`, where `plan` maps date keys to `{ workout, km, kmDone, completed, notes, feeling }`. **If you change the data model significantly, bump `SK` (`marathon-v6` → `v7`)** to avoid loading stale-shaped data. `actualKm(e)` reads `kmDone` falling back to `km`.

### AI coach — `api/coach.js`
Vercel **Node.js** serverless function (not an Edge Function). `TodayView` POSTs training context to `/api/coach`; the function builds a coaching prompt and streams Claude's reply back as `text/plain` chunks, which the client reads via a `ReadableStream` reader and appends live into a chat bubble.
- Model is `MODEL` at the top of the file (`claude-sonnet-4-6`; bump to `claude-opus-4-8` for max quality).
- **Key handling**: `ANTHROPIC_API_KEY` is read **only** server-side. It must NOT have a `VITE_` prefix — any `VITE_`-prefixed var is bundled into the public client JS and would leak the key. Set it in `.env` locally and in Vercel project env vars in production.
- Context sent: the coach gets the **full plan in both directions** — every completed session (history) and every remaining planned session through race day (the road ahead) — plus the viewed day's details, week/month km totals, days-until-race, and training phase. The whole context lives in the **system prompt** (via `buildContextBlock`) so it persists across the conversation. To keep the prompt bounded late in the block, completed sessions older than `FULL_DETAIL_DAYS` (14) are summarised to one line (`date: km emoji`) while the last 2 weeks keep full detail. The client assembles `history`/`upcoming` in `buildCoachContext` (`src/App.jsx`); the server formats them in `buildContextBlock` (`api/coach.js`).

## Conventions
- Touch targets ≥44px; `WebkitTapHighlightColor:"transparent"` on interactive elements; `env(safe-area-inset-*)` for the iPhone notch/home indicator.
- The training plan is hardcoded in `PLAN_WEEKS`; a multi-athlete version would move it to per-user storage or a database.
