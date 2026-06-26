# Marathon Tracker

A mobile-first marathon training app built with React + Vite. Designed for iPhone. No backend — all data is stored in `localStorage` per athlete device.

---

## Getting started

```bash
npm install
npm run dev        # local dev server at http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview production build locally
```

---

## Deploy to Vercel (via GitHub)

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Vercel auto-detects Vite — no config needed
4. Deploy. Every push to `main` auto-deploys to the same URL

---

## Project structure

```
marathon-tracker/
├── index.html          # Entry point — mobile viewport meta, theme colour
├── vite.config.js      # Vite + React plugin
├── package.json
└── src/
    ├── main.jsx        # React root render
    └── App.jsx         # Entire app — single file by design (see below)
```

Everything lives in `src/App.jsx`. This was a deliberate choice during prototyping: one file, no imports between components, easy to iterate. As the app grows, components can be split out into `src/components/`.

---

## Architecture

### Storage
`localStorage` only. Key: `marathon-v6`. Stored as a single JSON blob:

```js
{
  name: string,          // race name, e.g. "Berlin Marathon 2026"
  raceDate: string,      // ISO date "2026-10-25"
  startDate: string,     // ISO date — when training started
  plan: {
    "2026-06-26": {
      workout: string,   // e.g. "Easy run", "Long run", "🧘 Yoga / Pilates"
      km: number|null,   // target distance
      kmDone: number|null, // actual distance logged (null = not logged separately)
      completed: boolean,
      notes: string,
      feeling: number|null  // 1–5 (😫 😕 😐 😊 🔥), null = not rated
    },
    ...
  }
}
```

### Navigation
Screen-based (`screen` state): `"main"` | `"setup"` | `"editday"`. No router. All navigation is state transitions. No `<Link>` or `useNavigate`.

### Key constants
- `PLAN_WEEKS` — 17-week training plan array `[Mon, Tue, Wed, Thu, Fri, Sat, Sun]` per week. Starts Mon 29 Jun 2026, race Sun 25 Oct 2026.
- `TIPS` — workout tip definitions keyed by type (easy, tempo, long, intervals_800, etc.)
- `ALTS` — alternative workout options shown when athlete isn't running (🧘 🚶 🚴 ⋯ 🤒)
- `FEELINGS` — post-session rating scale (value 1–5, emoji + label)
- `C` — colour tokens (sage, warm, done, surface, bg, border, text, muted, subtle)

### Views (inside `"main"` screen)
- `TodayView` — default. Day navigation with ‹ › arrows. Km stepper (−/+0.5km) after completion. Feeling rating. Alternative workouts. Notes.
- `WeekView` — 7-day strip + schedule list. ‹ › week navigation with ↩ Today.
- `MonthView` — calendar grid with km per cell. ‹ › month navigation with ↩ Today.

---

## What's been built

- [x] 17-week pre-loaded training plan (Base → Build → Peak → Taper → Race)
- [x] Today / Week / Month views
- [x] Day navigation with prev/next arrows in all views
- [x] Km logging via stepper (no keyboard for common case; tap number for exact entry)
- [x] Feeling rating per session (😫 😕 😐 😊 🔥)
- [x] Workout tips per session type (effort level + coach guidance)
- [x] Alternative workouts (Yoga, Walking, Cycling, Other, Sick/Injured)
- [x] Remove workout / Add & change run
- [x] Race-done state (header transforms to 🏆 trophy when Oct 25 is completed)
- [x] Mobile-first design (iPhone, 44px touch targets, safe area insets)
- [x] localStorage persistence — works on published link, no login required

---

## AI coach ✅ built

When the athlete taps "Ask the coach 💬" on the Today workout card, Claude explains
that day's session in context — where they are in the plan, how they've been feeling
(from the feeling ratings), and the week/month load. The response streams into a chat
bubble below the button.

### How it works

```
src/App.jsx          "Ask the coach" button + streaming chat bubble (TodayView)
   │  POST /api/coach  { raceName, daysUntilRace, phase, day, recent, week, month }
   ▼
api/coach.js         Vercel Node.js serverless function (NOT an Edge Function)
                       - reads ANTHROPIC_API_KEY from server env (never sent to the browser)
                       - builds the coaching prompt from the context
                       - calls Claude with @anthropic-ai/sdk and streams text back
```

- **Model:** `claude-sonnet-4-6` — fast enough for a mobile chat bubble, strong quality.
  Set in `MODEL` at the top of `api/coach.js`; bump to `claude-opus-4-8` for max quality.
- **Context sent:** days until race, training phase (Base → Build → Peak → Taper → Race
  week, derived from days-to-race), the viewed day's workout/km/feeling, the last up-to-5
  completed sessions with feelings, and week/month km totals (done vs planned).
- **Streaming:** the function streams `text/plain` chunks; the client reads the body with
  a `ReadableStream` reader and appends each chunk into the bubble live.

### Why a server-side proxy (and not `VITE_ANTHROPIC_API_KEY`)

The Anthropic API can't be called directly from the browser — CORS blocks it, and any
`VITE_`-prefixed env var is **bundled into the public client JS**, exposing the key. So the
key lives only in `ANTHROPIC_API_KEY` (no `VITE_` prefix) and is read only inside
`api/coach.js`, which runs server-side on Vercel.

### Running the coach locally

`npm run dev` serves the UI but **cannot run `/api/coach`** (Vite doesn't execute the
serverless function). To exercise the coach end-to-end locally:

```bash
cp .env.example .env        # then paste your key into ANTHROPIC_API_KEY
npx vercel dev              # serves the UI AND the /api function
```

In production, set `ANTHROPIC_API_KEY` in the Vercel project's Environment Variables.
`.env` is git-ignored so the key is never committed.

---

## Design tokens

All colours are in the `C` object at the top of `App.jsx`:

| Token | Value | Used for |
|-------|-------|---------|
| `sage` | `#8B9E8A` | Primary accent, active states |
| `sageLt` | `rgba(139,158,138,0.15)` | Pill backgrounds, today highlight |
| `sageDk` | `#4d6b4c` | Text on sage backgrounds |
| `warm` | `#C4A882` | Planned km dots in calendar/strip |
| `done` | `#72ad6a` | Completed sessions |
| `doneLt` | `rgba(114,173,106,0.13)` | Completed card background |
| `surface` | `#FFFFFF` | Card backgrounds |
| `bg` | `#F5F3EF` | Page background |
| `border` | `#E5E1D8` | Default borders |

---

## Notes for Claude Code

- **Single file** — `src/App.jsx` is ~1000 lines. When adding features, read the whole file first to understand component boundaries before editing.
- **No CSS files** — all styling is inline. Adding a CSS module or Tailwind is a valid next step if the inline styles become unmanageable.
- **Storage key** — if you change the data model significantly, bump the storage key (`SK`) from `marathon-v6` to `marathon-v7` etc. to avoid loading stale data shapes.
- **Date arithmetic** — all date keys are `YYYY-MM-DD` strings. The helpers `dateKey()`, `todayStr()`, `offsetDate()`, `weekOf()`, `monthGrid()` handle all date logic. Don't use moment.js or date-fns — the native Date API is sufficient and keeps the bundle tiny.
- **The plan is hardcoded** — `PLAN_WEEKS` array in App.jsx. For a multi-athlete version, this moves to a database or per-user storage.
- **Mobile first** — all touch targets are ≥44px. `WebkitTapHighlightColor:"transparent"` on all interactive elements. `env(safe-area-inset-*)` for iPhone notch/home indicator.
