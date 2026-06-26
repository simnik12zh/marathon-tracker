# Marathon Tracker

A mobile-first marathon training app built with React + Vite. Designed for iPhone, installable as a PWA. No backend database — all athlete data lives in `localStorage` on the device, with an export/restore backup for safekeeping. A single Vercel serverless function powers an AI coach.

---

## Getting started

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173 — serves the UI only
npm run build      # production build → dist/
npm run preview    # preview the production build
npx vercel dev     # serves the UI AND the /api function (needed for the AI coach)
```

`npm run dev` serves the UI but **cannot run `/api/coach`** — Vite does not execute serverless functions. To exercise the coach end-to-end locally, use `npx vercel dev` with `ANTHROPIC_API_KEY` set in `.env`.

---

## Deploy to Vercel (via GitHub)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Vercel auto-detects Vite — no config needed
4. Add `ANTHROPIC_API_KEY` in the project's Environment Variables (for the AI coach)
5. Deploy. Every push to `main` auto-deploys to the same URL

---

## Project structure

```
marathon-tracker/
├── index.html          # Entry point — mobile viewport, theme colour, PWA/iOS meta, icons
├── manifest.json       # → public/manifest.json (PWA manifest)
├── vite.config.js      # Vite + React plugin
├── package.json
├── api/
│   └── coach.js        # Vercel Node.js serverless function — the AI coach
├── public/
│   ├── manifest.json   # PWA manifest
│   └── icon-192/512/1024.png   # running-figure app icon
└── src/
    ├── main.jsx        # React root render
    └── App.jsx         # Entire app — single file by design (see below)
```

The whole UI lives in `src/App.jsx` (~1770 lines). This was a deliberate choice during prototyping: one file, no imports between components, easy to iterate. As the app grows, components can be split out into `src/components/`.

---

## Architecture

### Storage

`localStorage` only. Key: `marathon-v8`. Stored as a single JSON blob:

```js
{
  name: string,          // race name, e.g. "Berlin Marathon 2026"
  athleteName: string,   // the runner's name (used by the coach)
  raceDate: string,      // ISO date "2026-10-25"
  startDate: string,     // ISO date — when training started
  plan: {
    "2026-06-26": {
      workout: string,      // e.g. "Easy run", "Long run", "🧘 Yoga"
      km: number|null,      // target distance
      kmDone: number|null,  // actual distance logged (null = not logged separately)
      completed: boolean,
      notes: string,
      feeling: number|null  // 1–5 (😫 😕 😐 😊 🔥), null = not rated
    },
    ...
  }
}
```

Per-day coach conversations are stored separately under `coach-YYYY-MM-DD` keys. If you change the data model significantly, bump the storage key (`marathon-v8` → `v9` etc.) to avoid loading stale data shapes.

### Backup — export / restore

The data lives on one device only, so the settings screen (⚙) offers a backup:

- **Export my data** downloads a JSON file with the `marathon-v8` blob plus every coach conversation. On iPhone, tap "More…" → "Save to Files" → iCloud Drive to keep it safe.
- **Restore from backup** loads such a file, replacing the current data, then reloads the app.

### Navigation

Screen-based (`screen` state): `"main"` | `"setup"` | `"editday"` | `"coach"`. No router — all navigation is state transitions, no `<Link>` or `useNavigate`.

### Key constants

- `PLAN_WEEKS` — 17-week training plan, `[Mon, Tue, Wed, Thu, Fri, Sat, Sun]` per week. Week 1 starts Mon 29 Jun 2026, race Sun 25 Oct 2026. Phases: Base → Build → Peak → Taper → Race week, with recovery (deload) weeks at 4, 8, 12.
- `TIPS` / `getTip` — per-workout effort guidance (easy, tempo, long, intervals, race day…).
- `ZONE` / `getZone` — Z1–Z4 training-zone pills shown on running sessions.
- `ALTS` — alternative workout options (🧘 🚶 🚴 ⋯ 🤒).
- `SHEET_OPTIONS` — the "What are you doing today?" bottom-sheet grid.
- `FEELINGS` — post-session rating scale (value 1–5, emoji + label).
- `PHASES` / `DELOAD_WEEKS` — Journey view phase descriptions and recovery weeks.
- `C` — colour tokens (sage, warm, done, surface, bg, border, text, muted, subtle).

### Views (inside the `"main"` screen)

Four tabs:

- **Today** — default. Day navigation with ‹ › arrows and horizontal swipe (with slide animation). Stats row (today / week / month km). Mark-as-done, km stepper (−/+0.5km, tap to type exact), feeling rating, collapsible notes. A ⇅ button opens the bottom-sheet workout switcher; "Ask the coach 💬" opens the full-screen coach.
- **Week** — 7-day strip + schedule list, ‹ › / swipe navigation with ↩ Today. Tap a day to jump to it in Today.
- **Month** — calendar grid showing km per cell (workout emojis for non-running days), ‹ › / swipe navigation with ↩ Today. Tap a day to jump to it in Today.
- **Journey** — the full plan as a vertical timeline grouped by phase (Base/Build/Peak/Taper/Race Week), with per-week progress bars, longest-run highlights and recovery-week tags. Tap a week to jump to it in Week view.

---

## AI coach

Tapping **"Ask the coach 💬"** on the Today card opens a **full-screen chat** (`CoachScreen`) with Claude acting as the athlete's coach. The empty state offers a one-tap starter ("Tell me about today's session"); after that the athlete keeps asking follow-up questions in a text field, and the full back-and-forth renders in the thread (assistant left, athlete right). Each reply streams in live. The conversation is saved to `localStorage` per day (`coach-YYYY-MM-DD`), so it survives closing the app and navigating between days; "New conversation" clears that day's history.

Because the coach is sent the **full plan — all completed sessions and all remaining ones through race day** — it can talk about any session (past or upcoming), explain how the plan builds, and ground its advice in how the athlete has actually been training.

### How it works

```
src/App.jsx (CoachScreen)   full-screen persistent streaming chat
   │  POST /api/coach  { athleteName, raceName, raceDate, today, daysUntilRace,
   │                     phase, day, history, upcoming, week, month, messages }
   ▼
api/coach.js                Vercel Node.js serverless function (NOT an Edge Function)
                              - reads ANTHROPIC_API_KEY from server env (never sent to the browser)
                              - builds the plan context into the SYSTEM prompt (buildContextBlock)
                              - sends the full `messages` array to Claude (@anthropic-ai/sdk)
                              - streams the reply back as text/plain
```

- **Model:** `claude-sonnet-4-6` — fast enough for a mobile chat bubble, strong quality. Set in `MODEL` at the top of `api/coach.js`; bump to `claude-opus-4-8` for max quality.
- **Context sent:** the **full plan in both directions** — every completed session (`history`: date, workout, planned/done km, feeling, notes) and every remaining planned session through race day (`upcoming`: date, workout, km) — plus the viewed day's details, week/month km totals, days until race, training phase, and the athlete's name. It's assembled client-side in `buildCoachContext` (`src/App.jsx`) and rendered into the **system prompt** by `buildContextBlock` (`api/coach.js`), so it stays available however long the chat grows.
- **Token budget:** to keep the prompt bounded late in the 17-week block, completed sessions older than `FULL_DETAIL_DAYS` (14) are summarised to one line (`date: km emoji`) while the last 2 weeks keep full detail.
- **Streaming:** the function streams `text/plain` chunks; the client reads the body with a `ReadableStream` reader and appends each chunk into the bubble live.

### Why a server-side proxy (and not `VITE_ANTHROPIC_API_KEY`)

The Anthropic API can't be called directly from the browser — CORS blocks it, and any `VITE_`-prefixed env var is **bundled into the public client JS**, exposing the key. So the key lives only in `ANTHROPIC_API_KEY` (no `VITE_` prefix) and is read only inside `api/coach.js`, which runs server-side on Vercel. `.env` is git-ignored so the key is never committed.

---

## Notes for Claude Code

- **Single file** — `src/App.jsx` is ~1770 lines. When adding features, read the whole file first to understand component boundaries before editing.
- **No CSS files** — all styling is inline; keyframe animations are injected via inline `<style>` tags. Adding a CSS module or Tailwind is a valid next step if the inline styles become unmanageable.
- **Storage key** — if you change the data model significantly, bump the storage key (`SK`) from `marathon-v8` to `marathon-v9` etc. to avoid loading stale data shapes.
- **Date arithmetic** — all date keys are `YYYY-MM-DD` strings. The helpers `dateKey()`, `todayStr()`, `offsetDate()`, `weekOf()`, `monthGrid()`, `daysUntil()` handle all date logic. Don't use moment.js or date-fns — the native Date API keeps the bundle tiny.
- **The plan is hardcoded** — `PLAN_WEEKS` in App.jsx. For a multi-athlete version, this moves to a database or per-user storage.
- **Mobile first** — all touch targets are ≥44px, `WebkitTapHighlightColor:"transparent"` on interactive elements, `env(safe-area-inset-*)` for the iPhone notch/home indicator.
