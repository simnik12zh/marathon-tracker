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

## Planned next feature: AI coach

The big next thing is an in-app AI coach. When the athlete taps "Ask the coach", Claude explains today's session in context — accounting for where they are in the plan, how they've been feeling (from the feeling ratings), and what's coming up.

**Suggested implementation:**
- Add an "Ask the coach 💬" button to the Today workout card
- POST to the Anthropic API (`/v1/messages`) with a prompt that includes:
  - Current date and days until race
  - Today's planned workout and km
  - The phase (base / build / peak / taper)
  - Last 3–5 days of completed sessions + feelings from `plan`
  - Week and month km totals (done vs planned)
- Stream the response into a chat bubble below the button
- Model: `claude-sonnet-4-6` — fast enough for mobile, quality is good
- API key: store in `.env` as `VITE_ANTHROPIC_API_KEY` and access via `import.meta.env.VITE_ANTHROPIC_API_KEY`

**Important:** The Anthropic API does not allow direct browser calls from a public URL (CORS + key exposure). You'll need a thin proxy — a Vercel Edge Function works well:

```
/api/coach.js  →  Vercel Edge Function
                   receives { prompt } from client
                   calls Anthropic API with key from env
                   streams response back to client
```

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
