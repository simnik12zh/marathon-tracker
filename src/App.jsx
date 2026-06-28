import { useState, useEffect, useRef } from "react";

const SK = "marathon-v9";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DL = ["M","T","W","T","F","S","S"];
const DN = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function pad(n) { return String(n).padStart(2,"0"); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function todayStr() { return dateKey(new Date()); }
function offsetDate(off) { const d=new Date(); d.setDate(d.getDate()+off); return dateKey(d); }

// Storage: localStorage works in published artifacts with no login required
async function storeGet(key) {
  try { return localStorage.getItem(key); } catch(e) { return null; }
}
async function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch(e) {}
}
function daysUntil(ds) {
  if (!ds) return null;
  const t=new Date(ds+"T00:00:00"), n=new Date(); n.setHours(0,0,0,0);
  return Math.ceil((t-n)/86400000);
}
// Map days-to-race onto the plan's macro phases (Base → Build → Peak → Taper → Race)
function phaseFor(days) {
  if (days==null) return null;
  if (days>84) return "Base";
  if (days>42) return "Build";
  if (days>21) return "Peak";
  if (days>7)  return "Taper";
  if (days>=0) return "Race week";
  return "Post-race";
}
function weekOf(off=0) {
  const n=new Date(), dow=n.getDay(), mon=new Date(n);
  mon.setDate(n.getDate()-(dow===0?6:dow-1)+off*7);
  return Array.from({length:7},(_,i)=>{
    const d=new Date(mon); d.setDate(mon.getDate()+i); return dateKey(d);
  });
}
function monthGrid(y,m) {
  const skip=(new Date(y,m,1).getDay()+6)%7, total=new Date(y,m+1,0).getDate();
  return [...Array(skip).fill(null),...Array.from({length:total},(_,i)=>`${y}-${pad(m+1)}-${pad(i+1)}`)];
}
function fmtKm(n) { if (!n) return "0"; return n%1===0?`${n}`:`${n.toFixed(1)}`; }
function actualKm(e) { if (!e?.completed) return 0; return e.kmDone!=null?e.kmDone:(e.km||0); }
function plannedKm(e) { return e?.km||0; }
// Fixed original-plan distance — set once in buildDefaultPlan and never edited by any
// user action, so weekly/monthly planned totals stay constant even after a session is
// swapped to a non-running workout. Falls back to km for entries without the field.
function origKm(e) { return e?.plannedKm!=null?e.plannedKm:(e?.km||0); }

// ─── Workout tips ─────────────────────────────────────────────────────────────
const TIPS = {
  easy: {
    label:"🟢  Easy effort",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"Run slow enough to hold a full conversation — this is never too slow. Easy runs build your aerobic engine and help your body recover between harder sessions. Most of your training feels like this, and that's intentional.",
  },
  recovery: {
    label:"🟢  Recovery",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"Even easier than your usual easy pace. Your body repaired muscle overnight — help it finish the job. If your legs feel heavy, that's normal and exactly why this run exists.",
  },
  long: {
    label:"🟢  Easy–Moderate",
    color:"#7a8a5a", bg:"rgba(139,158,138,0.1)",
    text:"The most important session of the week. Keep it conversational — you'll be running for a long time and time on your feet matters more than speed. The last few kilometres will feel hard. That's the point. Trust the distance.",
  },
  tempo: {
    label:"🟡  Threshold effort",
    color:"#9a7a3a", bg:"rgba(196,168,130,0.12)",
    text:"Comfortably hard — you can push out a few words but not a full sentence. This pace sits right at your lactate threshold, which is where marathon runners are built. Hold it steady; don't go out too fast in the first kilometre.",
  },
  intervals_800: {
    label:"🔴  Hard intervals",
    color:"#c05050", bg:"rgba(192,80,80,0.08)",
    text:"Six 800m reps (twice around a standard track) at 5K effort. Jog easy for 90 seconds between each one. Always include 2km warm-up and cool-down — they're part of the session, not optional extras.",
  },
  intervals_1km_8: {
    label:"🔴  Hard intervals",
    color:"#c05050", bg:"rgba(192,80,80,0.08)",
    text:"Eight 1km reps at 10K effort with 90 seconds easy recovery between each. You should finish each rep feeling like you could do one more — if you're dying, slow down. This builds the speed that makes marathon pace feel controlled.",
  },
  intervals_1km_5: {
    label:"🟡  Sharpener",
    color:"#9a7a3a", bg:"rgba(196,168,130,0.12)",
    text:"Five 1km reps — shorter than your peak sessions, and that's intentional. This keeps your legs sharp without adding fatigue this close to race day. Controlled and smooth, not all-out.",
  },
  strides: {
    label:"🟢  Easy with strides",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"An easy run with 4–6 short accelerations of about 20 seconds at the end. Strides remind your legs how to turn over quickly without the fatigue of a full workout. Not sprints — smooth, relaxed pick-ups with full recovery between each.",
  },
  jog_strides: {
    label:"🟢  Very easy",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"A light jog to keep your legs loose during race week. The short strides at the end maintain your snap. Keep the whole thing short and effortless — you're tapering, not training. Resist the urge to do more.",
  },
  easy_jog: {
    label:"🟢  Very easy",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"Race week — your only job is to arrive at the start line feeling fresh. This is just 15–20 minutes to keep blood flowing and legs loose. No effort, no data, no pressure. When in doubt, go even slower.",
  },
  shakeout: {
    label:"🟢  Shake-out",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"A gentle 10–15 minute jog the morning before the race to shake out any stiffness. It's not a workout. Some people add 2–3 light strides. Then go home, stay off your feet, eat familiar food, and get to bed early even if you can't sleep.",
  },
  race_eve: {
    label:"😴  Rest",
    color:"#888888", bg:"rgba(138,138,138,0.08)",
    text:"Everything is done. Lay out your gear, check your race number and start time, eat a familiar dinner you've had before — tonight is not the night to try something new. The hay is in the barn.",
  },
  race: {
    label:"🏆  Race day",
    color:"#7a8a5a", bg:"rgba(139,158,138,0.1)",
    text:"Start slower than you think you need to — the first 10km should feel almost embarrassingly easy. Your goal is to run the second half faster than the first. At 30km your legs will question everything. That's normal. Trust your training.",
  },
  yoga: {
    label:"🧘  Active recovery",
    color:"#7a8a9a", bg:"rgba(122,138,154,0.1)",
    text:"Yoga and Pilates complement marathon training well — they improve flexibility, core strength and joint mobility. A smart swap on any day when running feels like too much.",
  },
  pilates: {
    label:"🤸  Core & stability",
    color:"#7a8a9a", bg:"rgba(122,138,154,0.1)",
    text:"Pilates builds the core strength, posture and stability that runners rely on. Strengthening these deep muscles helps prevent injury and improves your running economy — a smart complement to your training on easier days.",
  },
  strength: {
    label:"🏋️  Strength training",
    color:"#7a8a9a", bg:"rgba(122,138,154,0.1)",
    text:"Targeted strength work that makes you a more resilient runner. Focus on single-leg exercises, hip stabilisers, calf raises, and core. These sessions protect your joints and tendons as running volume increases.",
  },
  walking: {
    label:"🚶  Easy movement",
    color:"#5a8a58", bg:"rgba(90,138,88,0.08)",
    text:"Walking keeps blood flowing without the impact of running. On hard days this is a smart swap — your legs stay active and you won't lose meaningful fitness.",
  },
  cycling: {
    label:"🚴  Cross-training",
    color:"#7a8a5a", bg:"rgba(139,158,138,0.1)",
    text:"Cycling builds aerobic capacity and leg strength without ground impact. Keep it easy if you're swapping a recovery session, moderate if replacing something harder.",
  },
  hiit: {
    label:"💥  High intensity",
    color:"#c05050", bg:"rgba(192,80,80,0.08)",
    text:"Short, hard efforts with recovery between. Great cross-training for marathon runners — builds power and burns high calories. Keep sessions under 30 minutes and avoid doing this the day before a long run.",
  },
  other: {
    label:"⋯  Cross-training",
    color:"#888888", bg:"rgba(138,138,138,0.08)",
    text:"Any movement beats none. Log what you did and how it felt in the notes — it all counts over a 17-week build.",
  },
  sick: {
    label:"🤒  Rest & recover",
    color:"#888888", bg:"rgba(138,138,138,0.08)",
    text:"Don't try to make up lost sessions — you can't train when ill or injured. Rest is the workout. Most runners lose more fitness pushing through than by taking a few days off completely.",
  },
};

function getTip(workout) {
  if (!workout) return null;
  const w = workout.toLowerCase();
  if (w.includes("race day") || (w.includes("marathon") && w.includes("race"))) return TIPS.race;
  if (w.includes("race eve") || w.includes("final preparation")) return TIPS.race_eve;
  if (w.includes("shake-out") || w.includes("shakeout")) return TIPS.shakeout;
  if (w.includes("800")) return TIPS.intervals_800;
  if (w.includes("sharpener") || w.includes("5×1") || w.includes("5x1")) return TIPS.intervals_1km_5;
  if (w.includes("track") || w.includes("8×1") || w.includes("8x1")) return TIPS.intervals_1km_8;
  if (w.includes("tempo")) return TIPS.tempo;
  if (w.includes("long run") || w.includes("test gels")) return TIPS.long;
  if (w.includes("recovery")) return TIPS.recovery;
  if (w.includes("strides") && w.includes("jog")) return TIPS.jog_strides;
  if (w.includes("strides")) return TIPS.strides;
  if (w.includes("easy jog") || w.includes("jog")) return TIPS.easy_jog;
  if (w.includes("easy") || w.includes("first session")) return TIPS.easy;
  if (w.includes("yoga")) return TIPS.yoga;
  if (w.includes("pilates")) return TIPS.pilates;
  if (w.includes("strength") || w.includes("kraft")) return TIPS.strength;
  if (w.includes("walking") || w.includes("hiking")) return TIPS.walking;
  if (w.includes("cycling") || w.includes("cycle")) return TIPS.cycling;
  if (w.includes("hiit")) return TIPS.hiit;
  if (w.includes("⋯") || w.includes("other")) return TIPS.other;
  if (w.includes("sick") || w.includes("injur")) return TIPS.sick;
  return null;
}

const ALTS = [
  { emoji:"💥", label:"HIIT" },
  { emoji:"🧘", label:"Yoga" },
  { emoji:"🤸", label:"Pilates" },
  { emoji:"🏋️", label:"Strength" },
  { emoji:"🚶", label:"Walking" },
  { emoji:"🚴", label:"Cycling" },
  { emoji:"⋯", label:"Other" },
  { emoji:"🤒", label:"Sick / Injured" },
];

// ⋯ sheet "What are you doing today?" grid.
const SHEET_OPTIONS = [
  { emoji: '🏃', label: 'Run',          action: 'run' },
  { emoji: '💥', label: 'HIIT',         action: 'hiit' },
  { emoji: '🧘', label: 'Yoga',         action: 'yoga' },
  { emoji: '🤸', label: 'Pilates',      action: 'pilates' },
  { emoji: '🏋️', label: 'Strength',    action: 'strength' },
  { emoji: '🚶', label: 'Walking',      action: 'walking' },
  { emoji: '🚴', label: 'Cycling',      action: 'cycling' },
  { emoji: '⋯',  label: 'Other',        action: 'other' },
  { emoji: '🤒', label: 'Sick/Injured', action: 'sick' },
  { emoji: '😴', label: 'Rest day',     action: 'rest' },
];

const FEELINGS = [
  { value:1, emoji:"😫", label:"Dead legs" },
  { value:2, emoji:"😕", label:"Tough" },
  { value:3, emoji:"😐", label:"OK" },
  { value:4, emoji:"😊", label:"Good" },
  { value:5, emoji:"🔥", label:"Flying" },
];

// ─── Milestone celebrations ─────────────────────────────────────────────────────
// Shown once each (a `milestone-<id>` localStorage flag prevents repeats) when a run
// is logged. check(entry, totalKm, allEntries) → boolean; entry is the just-logged
// run, allEntries is every completed run ({...entry, date}). One fires per log.
const MILESTONES = [
  // Session milestones
  { id: 'first-run',
    check: (entry, total, allEntries) =>
      allEntries.filter(e => e.completed && e.kmDone).length === 1,
    emoji: '🏃', title: 'First run logged!',
    message: "Every marathon starts with a single run. This is yours." },

  { id: 'first-long-run',
    check: (entry) => entry.kmDone >= 16,
    emoji: '💪', title: 'First long run!',
    message: "This is where marathon runners are made. Welcome to the long game." },

  { id: 'first-20k',
    check: (entry) => entry.kmDone >= 20,
    emoji: '🎯', title: '20km done!',
    message: "20km. Your body just learned something it won't forget." },

  { id: 'first-25k',
    check: (entry) => entry.kmDone >= 25,
    emoji: '🔥', title: '25km — new territory!',
    message: "You're running distances most people never will. Keep going." },

  { id: 'first-30k',
    check: (entry) => entry.kmDone >= 30,
    emoji: '⚡', title: '30km. Seriously.',
    message: "The marathon is just 12km more from here. You've got this." },

  { id: 'first-tempo',
    check: (entry, total, allEntries) =>
      entry.workout?.toLowerCase().includes('tempo') &&
      allEntries.filter(e => e.completed && e.workout?.toLowerCase().includes('tempo')).length === 1,
    emoji: '⚡', title: 'First tempo run!',
    message: "Today you pushed for the first time. This is how you get faster." },

  { id: 'first-track',
    check: (entry, total, allEntries) =>
      entry.workout?.toLowerCase().includes('track') &&
      allEntries.filter(e => e.completed && e.workout?.toLowerCase().includes('track')).length === 1,
    emoji: '🏟️', title: 'First track session!',
    message: "Speed work done. Your legs just found another gear." },

  { id: 'first-gel-test',
    check: (entry, total, allEntries) =>
      entry.workout?.toLowerCase().includes('test gels') &&
      allEntries.filter(e => e.completed && e.workout?.toLowerCase().includes('test gels')).length === 1,
    emoji: '🧃', title: 'First gel test!',
    message: "Race nutrition sorted. One less thing to worry about on race day." },

  { id: 'first-deload-run',
    check: (entry, total, allEntries) => {
      const completedRuns = allEntries.filter(e => e.completed && e.kmDone);
      // Trigger on first run after a gap of 2+ days with no runs (deload pattern)
      return completedRuns.length > 3 && entry.kmDone <= 10;
    },
    emoji: '🔄', title: 'Back after recovery!',
    message: "Your body absorbed the work. Now we build again." },

  { id: 'personal-longest',
    check: (entry, total, allEntries) => {
      const prevMax = Math.max(0, ...allEntries
        .filter(e => e.completed && e.kmDone && e !== entry)
        .map(e => e.kmDone));
      return entry.kmDone > prevMax && entry.kmDone >= 10;
    },
    emoji: '📈', title: 'Longest run ever!',
    message: "Further than you've ever gone. That's the whole point." },

  { id: 'last-long-run',
    check: (entry, total, allEntries) => {
      // Longest run in taper phase — run over 20km after week 12
      const completedRuns = allEntries.filter(e => e.completed && e.kmDone);
      return entry.kmDone >= 20 && completedRuns.length >= 40;
    },
    emoji: '🎒', title: 'Last long one.',
    message: "The hay is in the barn. Trust what you've built." },

  { id: 'shake-out-jog',
    check: (entry) =>
      entry.workout?.toLowerCase().includes('shake-out'),
    emoji: '🌅', title: 'Race eve shake-out done.',
    message: "Tomorrow is race day. You are ready. Go get some sleep." },

  // Consistency milestones
  { id: 'runs-10',
    check: (entry, total, allEntries) =>
      allEntries.filter(e => e.completed && e.kmDone).length === 10,
    emoji: '🔟', title: '10 runs done!',
    message: "10 runs. It's not a phase anymore — it's a habit." },

  { id: 'runs-25',
    check: (entry, total, allEntries) =>
      allEntries.filter(e => e.completed && e.kmDone).length === 25,
    emoji: '🏅', title: '25 runs logged!',
    message: "25 runs deep. You're doing what most people only talk about." },

  { id: 'week-one-complete',
    check: (entry, total, allEntries) => {
      // All planned runs in week 1 completed
      const week1Runs = allEntries.filter(e =>
        e.completed && e.kmDone &&
        e.date >= '2026-06-29' && e.date <= '2026-07-05'
      );
      return week1Runs.length >= 3;
    },
    emoji: '🗓️', title: 'Week 1 complete!',
    message: "First week done. The hardest part was starting. You started." },

  { id: 'four-weeks',
    check: (entry, total, allEntries) =>
      allEntries.filter(e => e.completed && e.kmDone).length === 20,
    emoji: '📅', title: 'One month of training!',
    message: "Four weeks in. Your body is different from when you started." },

  { id: 'halfway',
    check: (entry, total, allEntries) =>
      allEntries.filter(e => e.completed && e.kmDone).length === 35,
    emoji: '🏁', title: 'Halfway through the plan!',
    message: "8 weeks down, 8 to go. The hard work is just beginning — and you're ready for it." },

  // Cumulative km milestones
  { id: 'total-50k',
    check: (entry, total) => total >= 50,
    emoji: '🎉', title: '50km total!',
    message: "50km in the bank. Your body is adapting. Keep building." },

  { id: 'total-100k',
    check: (entry, total) => total >= 100,
    emoji: '💯', title: '100km logged!',
    message: "100km. That's not motivation anymore — that's proof." },

  { id: 'total-200k',
    check: (entry, total) => total >= 200,
    emoji: '🚀', title: '200km — halfway there!',
    message: "200km of training in your legs. The marathon won't know what hit it." },

  { id: 'total-300k',
    check: (entry, total) => total >= 300,
    emoji: '🏔️', title: '300km. Elite territory.',
    message: "Most people never run 300km in their life. You did it in one training block." },

  { id: 'total-500k',
    check: (entry, total) => total >= 500,
    emoji: '🌟', title: '500km logged!',
    message: "500km. You are ready. You just don't know it yet." },
];

// ─── 17-week plan (race Sun 25 Oct 2026) ─────────────────────────────────────
const PLAN_WEEKS = [
  // Week 1 (Jun 29) — Phase 1: Base
  [['Pilates',null],['Easy run',8],['Strength',null],['Easy run',8],['Yoga',null],['Long run',16],['Easy recovery run',6]],
  // Week 2 (Jul 6) — Phase 1: Base
  [['Pilates',null],['Easy run',8],['Yoga',null],['Easy run',10],['Strength',null],['Long run',18],['Easy recovery run',6]],
  // Week 3 (Jul 13) — Phase 1: Base
  [['Pilates',null],['Easy run',10],['Strength',null],['Easy run',10],['Yoga',null],['Long run',20],['Easy recovery run',8]],
  // Week 4 (Jul 20) — Deload
  [['Yoga',null],['Easy run',7],['Pilates',null],['Easy run',8],null,['Long run',15],['Easy recovery run',6]],
  // Week 5 (Jul 27) — Phase 2: Build
  [['Pilates',null],['Easy run',10],['Tempo run',10],['Strength',null],['Easy run',8],['Long run',22],['Easy recovery run',8]],
  // Week 6 (Aug 3) — Phase 2: Build
  [['Pilates',null],['Easy run',10],null,['Tempo run',12],['Yoga',null],['Long run',24],['Easy recovery run',8]],
  // Week 7 (Aug 10) — Phase 2: Build
  [['Pilates',null],['Easy run',10],['Track session – 6×800m',11],['Strength',null],['Easy run',8],['Long run',26],['Easy recovery run',8]],
  // Week 8 (Aug 17) — Deload
  [['Yoga',null],['Easy run',8],['Pilates',null],['Easy run',8],null,['Long run',18],['Easy recovery run',6]],
  // Week 9 (Aug 24) — Phase 3: Peak
  [['Pilates',null],['Easy run',10],['Tempo run',14],['Strength',null],['Easy run',8],['Long run – test gels',28],['Easy recovery run',10]],
  // Week 10 (Aug 31) — Phase 3: Peak
  [['Pilates',null],['Easy run',10],['Track session – 8×1km',14],['Yoga',null],['Easy run',8],['Long run – test gels',30],['Easy recovery run',10]],
  // Week 11 (Sep 7) — Peak week
  [['Strength',null],['Easy run',10],['Tempo run',14],['Pilates',null],['Easy run',8],['Long run – test gels',32],['Easy recovery run',10]],
  // Week 12 (Sep 14) — Deload
  [['Yoga',null],['Easy run',8],['Pilates',null],['Easy run',8],null,['Long run',20],['Easy recovery run',6]],
  // Week 13 (Sep 21) — Phase 4: Taper
  [['Pilates',null],['Easy run',10],['Tempo run',10],['Strength',null],['Easy run',8],['Long run',22],['Easy recovery run',8]],
  // Week 14 (Sep 28) — Taper
  [['Yoga',null],['Easy run',8],['Sharpener – 5×1km',10],['Pilates',null],['Easy run',6],['Long run',18],['Easy recovery run',6]],
  // Week 15 (Oct 5) — Taper
  [['Pilates',null],['Easy run',8],['Tempo run',8],['Yoga',null],['Easy run',6],['Long run',14],['Easy recovery run',5]],
  // Week 16 (Oct 12) — Final taper
  [['Yoga',null],['Easy run with strides',6],['Pilates',null],['Easy run',5],null,['Easy run',8],['Easy recovery run',4]],
  // Week 17 (Oct 19) — Race week
  [['Pilates',null],['Easy jog with strides',5],['Easy jog',4],['Yoga',null],['Shake-out jog',3],null,['Marathon – Race Day',42.2]],
];

function buildDefaultPlan() {
  const plan = {};
  plan['2026-06-26'] = { workout:'Easy run', km:6, plannedKm:6 };
  plan['2026-06-27'] = { workout:'Long run', km:14, plannedKm:14 };
  plan['2026-06-28'] = { workout:'Yoga', km:null, plannedKm:null };
  PLAN_WEEKS.forEach((week,wi)=>{
    week.forEach((day,di)=>{
      const d=new Date(2026,5,29); d.setDate(d.getDate()+wi*7+di);
      if (day&&day[0]) plan[dateKey(d)]={ workout:day[0], km:day[1], plannedKm:day[1] };
    });
  });
  return plan;
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const C = {
  sage:"#8B9E8A", sageLt:"rgba(139,158,138,0.15)", sageDk:"#4d6b4c",
  warm:"#C4A882", done:"#72ad6a", doneLt:"rgba(114,173,106,0.13)",
  surface:"#FFFFFF", bg:"#F5F3EF", border:"#E5E1D8", borderSt:"#C8C4BA",
  text:"#2A2A2A", muted:"#6E6E6E", subtle:"#736D60",
};

function Chk({size=14,color="#fff"}) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3 8.5l3.5 3.5 6.5-7" stroke={color} strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
function NavArrow({onClick,dir}) {
  return (
    <button onClick={onClick} style={{
      width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",
      background:"none",border:`1px solid ${C.border}`,borderRadius:12,
      cursor:"pointer",color:C.muted,fontSize:20,flexShrink:0,
      WebkitTapHighlightColor:"transparent"}}>
      {dir==="left"?"‹":"›"}
    </button>
  );
}
// Line icons for the bottom tab bar.
function TabIcon({name,size=23}) {
  const p={width:size,height:size,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",
    strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};
  if (name==="today") return <svg {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2.5"/>
    <path d="M3 9h18M8 2.5v3.5M16 2.5v3.5"/>
    <circle cx="12" cy="15" r="1.7" fill="currentColor" stroke="none"/></svg>;
  if (name==="week") return <svg {...p}>
    <path d="M8 6h12M8 12h12M8 18h12"/>
    <circle cx="4" cy="6" r="1.1" fill="currentColor" stroke="none"/>
    <circle cx="4" cy="12" r="1.1" fill="currentColor" stroke="none"/>
    <circle cx="4" cy="18" r="1.1" fill="currentColor" stroke="none"/></svg>;
  if (name==="month") return <svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  return <svg {...p}><path d="M5 21V3M5 4h12l-2 3.5L17 11H5"/></svg>;   // journey — flag
}

// ─── Tip card ─────────────────────────────────────────────────────────────────
// Running training zone, shown as a pill in TipCard (running sessions only).
const ZONE = {
  'easy recovery run':  { label: 'Z1 · Recovery',  color: '#5a8a58', bg: 'rgba(90,138,88,0.1)' },
  'easy run':           { label: 'Z2 · Aerobic',   color: '#5a8a58', bg: 'rgba(90,138,88,0.1)' },
  'long run':           { label: 'Z2 · Aerobic',   color: '#5a8a58', bg: 'rgba(90,138,88,0.1)' },
  'easy jog':           { label: 'Z1 · Recovery',  color: '#5a8a58', bg: 'rgba(90,138,88,0.1)' },
  'shake-out jog':      { label: 'Z1 · Recovery',  color: '#5a8a58', bg: 'rgba(90,138,88,0.1)' },
  'tempo run':          { label: 'Z3 · Tempo',     color: '#9a7a3a', bg: 'rgba(196,168,130,0.15)' },
  'track session':      { label: 'Z4 · Threshold', color: '#c05050', bg: 'rgba(192,80,80,0.08)' },
  'sharpener':          { label: 'Z4 · Threshold', color: '#c05050', bg: 'rgba(192,80,80,0.08)' },
};
function getZone(workout) {
  if (!workout) return null;
  const w = workout.toLowerCase();
  for (const [key, zone] of Object.entries(ZONE)) {
    if (w.includes(key)) return zone;
  }
  return null;
}

function TipCard({workout}) {
  const tip = getTip(workout);
  if (!tip) return null;
  const zone = getZone(workout);
  return (
    <div style={{
      marginTop:14,paddingTop:14,
      borderTop:`1px solid ${C.border}`,
    }}>
      {zone && (
        <span style={{
          display:'inline-block',fontSize:11,fontWeight:700,
          color:zone.color,background:zone.bg,
          borderRadius:20,padding:'4px 11px',marginBottom:9,
        }}>{zone.label}</span>
      )}
      <p style={{
        margin:0,fontSize:13,color:C.muted,
        lineHeight:1.6,letterSpacing:"0.01em",
      }}>{tip.text}</p>
    </div>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────
function SetupScreen({initName,initAthlete,isEdit,onBack,onSave}) {
  const [a,setA]=useState(initAthlete||"");
  const [n,setN]=useState(initName||"");
  const ok=n.trim();

  // ── Backup: export / import all local data ──
  const fileRef=useRef(null);
  const [pendingImport,setPendingImport]=useState(null);   // parsed backup awaiting confirmation
  const [importError,setImportError]=useState("");
  const [howToOpen,setHowToOpen]=useState(false);   // "How to save your backup" tip expanded
  const exportData=()=>{
    const coach={};
    Object.keys(localStorage).filter(k=>k.startsWith('coach-')).forEach(k=>{ coach[k]=localStorage.getItem(k); });
    const data={
      exportedAt:new Date().toISOString(),
      version:SK,
      plan:localStorage.getItem(SK),
      coach,
    };
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download=`marathon-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const onFilePick=(ev)=>{
    const file=ev.target.files&&ev.target.files[0];
    ev.target.value="";                 // allow re-picking the same file later
    if (!file) return;
    setImportError("");
    const reader=new FileReader();
    reader.onload=()=>{
      try {
        const parsed=JSON.parse(reader.result);
        if (!parsed||!parsed.plan||!parsed.version) throw new Error("invalid");
        setPendingImport(parsed);
      } catch(e) {
        setPendingImport(null);
        setImportError("Invalid backup file — please select a valid marathon backup");
      }
    };
    reader.onerror=()=>{ setPendingImport(null); setImportError("Invalid backup file — please select a valid marathon backup"); };
    reader.readAsText(file);
  };
  const confirmImport=()=>{
    const d=pendingImport;
    if (!d) return;
    try {
      localStorage.setItem(SK, typeof d.plan==='string'?d.plan:JSON.stringify(d.plan));
      if (d.coach&&typeof d.coach==='object') {
        Object.keys(d.coach).forEach(k=>{ if (k.startsWith('coach-')) localStorage.setItem(k, d.coach[k]); });
      }
      try { sessionStorage.setItem('justRestored','1'); } catch {}
      window.location.reload();
    } catch(e) {
      setPendingImport(null);
      setImportError("Invalid backup file — please select a valid marathon backup");
    }
  };

  const inp={
    width:"100%",border:`1px solid ${C.border}`,borderRadius:12,
    padding:"14px 16px",fontFamily:"inherit",fontSize:16,color:C.text,
    background:C.bg,outline:"none",boxSizing:"border-box",WebkitAppearance:"none",
  };
  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",
      position:"relative",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",
      padding:"env(safe-area-inset-top,20px) 20px env(safe-area-inset-bottom,20px)"}}>
      {isEdit&&onBack&&(
        <div style={{position:"absolute",top:0,left:0,right:0,background:C.surface,
          borderBottom:`1px solid ${C.border}`,padding:"env(safe-area-inset-top,0px) 20px 0",
          display:"flex",alignItems:"center",gap:12,minHeight:56}}>
          <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",
            color:C.muted,fontSize:24,width:44,height:44,display:"flex",alignItems:"center",
            justifyContent:"center",flexShrink:0,marginLeft:-10,
            WebkitTapHighlightColor:"transparent"}}>←</button>
          <span style={{fontSize:17,fontWeight:600,color:C.text}}>Race settings</span>
        </div>
      )}
      {!isEdit&&<>
        <div style={{fontSize:56,marginBottom:20}}>🏅</div>
        <div style={{fontSize:28,fontWeight:700,textAlign:"center",marginBottom:10,
          lineHeight:1.25,color:C.text}}>Your marathon,<br/>your journey</div>
        <div style={{fontSize:15,color:C.muted,textAlign:"center",marginBottom:40,
          lineHeight:1.6,maxWidth:280}}>
          Your plan is ready. Track every kilometre, all the way to race day.
        </div>
      </>}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,
        borderRadius:20,padding:24,width:"100%",maxWidth:400}}>
        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:8}}>Your name</label>
        <input style={inp} placeholder="e.g. Anna"
          value={a} onChange={e=>setA(e.target.value)}/>
        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:8,marginTop:20}}>Race name</label>
        <input style={inp} placeholder="e.g. Berlin Marathon 2026"
          value={n} onChange={e=>setN(e.target.value)}/>
        <button disabled={!ok} onClick={()=>onSave(a.trim(),n.trim())} style={{
          width:"100%",padding:16,background:ok?C.sage:C.subtle,color:"#fff",
          border:"none",borderRadius:14,fontFamily:"inherit",fontSize:17,fontWeight:600,
          cursor:ok?"pointer":"default",marginTop:24,
          WebkitTapHighlightColor:"transparent"}}>
          {isEdit?"Save changes":"Start training →"}
        </button>
      </div>

      {isEdit&&(
        <div style={{width:"100%",maxWidth:400,marginTop:18}}>
          <button onClick={exportData} style={{width:"100%",padding:16,background:C.sage,
            color:"#fff",border:"none",borderRadius:14,fontFamily:"inherit",fontSize:16,
            fontWeight:600,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
            📥 Export my data
          </button>
          <div style={{display:"flex",flexDirection:"column",gap:5,margin:"16px 4px 20px"}}>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>Your data is stored on this device only.</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>After exporting, tap “More…” → “Save to Files” → iCloud Drive to keep a safe backup.</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>Restore anytime from the same file.</div>
            <button onClick={()=>setHowToOpen(o=>!o)} style={{alignSelf:"flex-start",marginTop:4,
              background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:12,
              fontWeight:500,padding:"2px 0",WebkitTapHighlightColor:"transparent"}}>
              ⓘ How to save your backup
            </button>
            {howToOpen&&(
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4,padding:"12px 14px",
                background:C.bg,border:`1px solid ${C.border}`,borderRadius:12}}>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>1. Tap “Export my data”</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>2. When the file appears, tap “More…”</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>3. Tap “Save to Files”</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>4. Choose iCloud Drive → Save</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>5. Your backup is now safe in the cloud</div>
              </div>
            )}
          </div>
          <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{width:"100%",padding:16,
            background:C.surface,color:C.sage,border:`1.5px solid ${C.sage}`,borderRadius:14,
            fontFamily:"inherit",fontSize:16,fontWeight:600,cursor:"pointer",
            WebkitTapHighlightColor:"transparent"}}>
            📤 Restore from backup
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={onFilePick} style={{display:"none"}}/>
          {importError&&(
            <div style={{marginTop:12,fontSize:13,color:"#c05050",textAlign:"center",lineHeight:1.4}}>
              {importError}
            </div>
          )}
          {pendingImport&&(
            <div style={{marginTop:14,padding:16,background:C.surface,border:`1px solid ${C.border}`,
              borderRadius:14}}>
              <div style={{fontSize:14,color:C.text,lineHeight:1.5,marginBottom:14}}>
                This will restore your training data. Your current data will be replaced. Continue?
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setPendingImport(null)} style={{flex:1,padding:13,
                  background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,fontFamily:"inherit",
                  fontSize:15,cursor:"pointer",color:C.muted,WebkitTapHighlightColor:"transparent"}}>
                  Cancel
                </button>
                <button onClick={confirmImport} style={{flex:1,padding:13,background:C.sage,
                  color:"#fff",border:"none",borderRadius:12,fontFamily:"inherit",fontSize:15,
                  fontWeight:600,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Edit day ─────────────────────────────────────────────────────────────────
const WORKOUT_OPTIONS = [
  "Easy run","Easy recovery run","Long run","Tempo run",
  "Track session – 6×800m","Track session – 8×1km","Sharpener – 5×1km",
  "Easy run with strides","Easy jog with strides","Easy jog","Shake-out jog",
];

// Shared km stepper (−/+0.5km) with a "tap to type exact" numeric input.
function KmStepper({value,onAdjust,raw,setRaw,typing,setTyping,accent}) {
  const stepBtn={width:48,height:48,borderRadius:"50%",background:C.bg,
    border:`1px solid ${C.border}`,fontSize:26,cursor:"pointer",color:C.text,
    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
    WebkitTapHighlightColor:"transparent"};
  if (typing) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <input type="text" inputMode="decimal" autoFocus value={raw}
          onChange={e=>setRaw(e.target.value)}
          style={{width:120,border:`1.5px solid ${C.borderSt}`,borderRadius:12,
            padding:"12px 14px",fontFamily:"monospace",fontSize:22,fontWeight:700,
            color:C.text,background:C.surface,outline:"none",boxSizing:"border-box",
            textAlign:"center",WebkitAppearance:"none"}}/>
        <span style={{fontSize:17,color:C.muted,fontWeight:500}}>km</span>
        <button onClick={()=>setTyping(false)} style={{marginLeft:"auto",padding:"11px 18px",
          background:accent,color:"#fff",border:"none",borderRadius:10,fontFamily:"inherit",
          fontSize:14,fontWeight:600,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>✓ Done</button>
      </div>
    );
  }
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <button onClick={()=>onAdjust(-0.5)} style={stepBtn}>−</button>
      <div onClick={()=>setTyping(true)} style={{flex:1,textAlign:"center",cursor:"pointer"}}>
        <KmBig value={value} color={accent} size={38}/>
        <span style={{fontSize:18,color:accent,fontWeight:500}}> km</span>
        <div style={{fontSize:11,color:C.subtle,marginTop:3}}>tap to type exact</div>
      </div>
      <button onClick={()=>onAdjust(0.5)} style={stepBtn}>+</button>
    </div>
  );
}

function EditDayScreen({dateKey:dk,entry,isRun,onSave,onBack}) {
  const DEFAULT_KM = {
    'Easy run': 8,
    'Easy recovery run': 6,
    'Long run': 20,
    'Tempo run': 10,
    'Track session – 6×800m': 11,
    'Track session – 8×1km': 14,
    'Sharpener – 5×1km': 10,
    'Easy run with strides': 6,
    'Easy jog with strides': 5,
    'Easy jog': 4,
    'Shake-out jog': 3,
  };
  const initialKnown=!!entry.workout&&WORKOUT_OPTIONS.includes(entry.workout);
  const [workoutSel,setWorkoutSel]=useState(initialKnown?entry.workout:"Custom…");
  const [customWorkout,setCustomWorkout]=useState(initialKnown?"":(entry.workout||""));
  const [km,setKm]=useState(entry.km!=null?String(entry.km):"");
  const [kmTyping,setKmTyping]=useState(false);
  const workout=workoutSel==="Custom…"?customWorkout:workoutSel;
  const kmNum=parseFloat(km)||0;
  const stepKm=(delta)=>setKm(String(Math.max(0,parseFloat((kmNum+delta).toFixed(1)))));
  // Switching workout auto-fills its default distance — but only if the current
  // km is still the previous workout's default (or empty), never a custom entry.
  const onWorkoutChange=(e)=>{
    const next=e.target.value;
    if (next!=="Custom…"&&DEFAULT_KM[next]!=null) {
      const prevDefault=DEFAULT_KM[workoutSel];
      const cur=km.trim();
      if (cur===""||(prevDefault!=null&&parseFloat(cur)===prevDefault)) {
        setKm(String(DEFAULT_KM[next]));
      }
    }
    setWorkoutSel(next);
  };
  const d=new Date(dk+"T00:00:00");
  const lbl=d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  const inp2={width:"100%",border:`1px solid ${C.border}`,borderRadius:12,
    padding:"13px 15px",fontFamily:"inherit",fontSize:16,color:C.text,
    background:C.bg,outline:"none",boxSizing:"border-box",WebkitAppearance:"none"};
  return (
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"system-ui,sans-serif",
      paddingBottom:"env(safe-area-inset-bottom,20px)"}}>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,
        padding:"env(safe-area-inset-top,0px) 20px 0",
        display:"flex",alignItems:"center",gap:14,minHeight:56}}>
        <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",
          color:C.muted,fontSize:24,width:44,height:44,display:"flex",alignItems:"center",
          justifyContent:"center",flexShrink:0,marginLeft:-10,
          WebkitTapHighlightColor:"transparent"}}>←</button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".08em",color:C.muted}}>Edit workout</div>
          <div style={{fontSize:15,fontWeight:600,color:C.text}}>{lbl}</div>
        </div>
      </div>
      <div style={{padding:20}}>
        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:8}}>{isRun?"Run type":"Workout"}</label>
        <select value={workoutSel} onChange={onWorkoutChange}
          style={{...inp2,WebkitAppearance:"menulist",appearance:"menulist",cursor:"pointer"}}>
          {WORKOUT_OPTIONS.map(o=>(<option key={o} value={o}>{o}</option>))}
          <option value="Custom…">Custom…</option>
        </select>
        {workoutSel==="Custom…"&&(
          <input style={{...inp2,marginTop:10}} placeholder="Type a workout…"
            value={customWorkout} onChange={e=>setCustomWorkout(e.target.value)}/>
        )}

        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:10,marginTop:20}}>Target distance</label>
        <KmStepper value={kmNum} onAdjust={stepKm} raw={km} setRaw={setKm}
          typing={kmTyping} setTyping={setKmTyping} accent={C.sage}/>

        <div style={{display:"flex",gap:12,marginTop:28}}>
          <button onClick={onBack} style={{padding:"15px 20px",background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:14,fontFamily:"inherit",
            fontSize:15,cursor:"pointer",color:C.muted,
            WebkitTapHighlightColor:"transparent"}}>Cancel</button>
          <button onClick={()=>onSave({workout,km:parseFloat(km)||null,
            kmDone:entry.kmDone??null,completed:!!entry.completed,notes:entry.notes??''})}
            style={{flex:1,padding:15,background:C.sage,color:"#fff",border:"none",
              borderRadius:14,fontFamily:"inherit",fontSize:16,fontWeight:600,
              cursor:"pointer",WebkitTapHighlightColor:"transparent"}}>Save</button>
        </div>
      </div>
    </div>
  );
}

// Big monospace km value with the decimal rendered smaller (28px) so the
// fixed-width gap around the dot reads as intentional rather than broken.
function KmBig({value,color,size=42}) {
  const [intPart,decPart]=fmtKm(value).split(".");
  return (
    <span style={{fontFamily:"monospace",fontWeight:700,color,lineHeight:1,whiteSpace:"nowrap"}}>
      <span style={{fontSize:size}}>{intPart}</span>
      {decPart!=null&&<span style={{fontSize:Math.round(size*0.66)}}>.{decPart}</span>}
    </span>
  );
}

// ─── Today view ───────────────────────────────────────────────────────────────
// Horizontal swipe gesture: swipe left → onLeft (next), swipe right → onRight
// (previous). 50px threshold so vertical scrolls don't trigger it.
function useSwipe(onLeft, onRight) {
  const touchStartX = useRef(null);
  return {
    onTouchStart: (e) => { touchStartX.current = e.touches[0].clientX; },
    onTouchEnd: (e) => {
      if (touchStartX.current === null) return;
      const delta = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(delta) > 50) (delta < 0 ? onLeft : onRight)();
      touchStartX.current = null;
    },
  };
}

// ─── Workout bottom sheet ───────────────────────────────────────────────────────
// "What are you doing today?" grid, shared by Today and Week views. Operates on a
// single dateKey: Run opens the editor, Rest clears the day, Other prompts for free
// text, everything else stores "<emoji> <label>".
function WorkoutSheet({dateKey:dk,entry,updDay,onEdit,onClose}) {
  const e=entry||{};
  const [otherMode,setOtherMode]=useState(false);
  const [otherText,setOtherText]=useState("");
  const confirmOther=()=>{
    const t=otherText.trim();
    if (!t) return;
    updDay(dk,{workout:`⋯ ${t}`,km:null,kmDone:null,completed:false});
    onClose();
  };
  const onSheetOption=(opt)=>{
    if (opt.action==="other") { setOtherMode(true); return; }   // ask what they're doing
    if (opt.action==="run") {
      // From a non-running session (matches an ALTS label, or has no km) open the
      // editor with a clean Easy-run default; an existing run is edited as-is.
      const w=(e.workout||"").toLowerCase();
      const isNonRunning=ALTS.some(a=>w.includes(a.label.toLowerCase()))||!(e.km>0);
      onEdit(dk, isNonRunning?{workout:'Easy run',km:8,kmDone:null,completed:false,notes:''}:undefined, true);
      onClose();
      return;
    }
    if (opt.action==="rest") { updDay(dk,{workout:'',km:null,kmDone:null,completed:false}); onClose(); return; }
    updDay(dk,{workout:`${opt.emoji} ${opt.label}`,km:null,kmDone:null,completed:false});
    onClose();
  };
  return (
    <>
      <div onClick={onClose}
        style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,
          WebkitTapHighlightColor:"transparent"}}/>
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:51,
        maxWidth:480,margin:"0 auto",background:C.surface,
        borderRadius:"20px 20px 0 0",boxShadow:"0 -8px 30px rgba(0,0,0,0.18)",
        padding:"8px 16px calc(20px + env(safe-area-inset-bottom))",
        animation:"sheetUp .25s ease-out"}}>
        <style>{"@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}"}</style>
        {/* Tappable grab handle — tap (or tap outside) to dismiss. */}
        <button onClick={onClose} aria-label="Close"
          style={{display:"block",width:"100%",background:"none",border:"none",
            cursor:"pointer",padding:"6px 0 14px",WebkitTapHighlightColor:"transparent"}}>
          <div style={{width:40,height:5,borderRadius:3,background:C.borderSt,margin:"0 auto"}}/>
        </button>

        {otherMode ? (
          <>
            <div style={{fontSize:16,fontWeight:600,color:C.text,margin:"4px 4px 16px"}}>
              What are you doing?
            </div>
            <div style={{display:"flex",gap:10}}>
              <input autoFocus value={otherText} onChange={ev=>setOtherText(ev.target.value)}
                onKeyDown={ev=>{ if(ev.key==="Enter") confirmOther(); }}
                placeholder="e.g. Hike, Swimming, Football"
                style={{flex:1,border:`1px solid ${C.border}`,borderRadius:12,
                  padding:"13px 15px",fontFamily:"inherit",fontSize:16,color:C.text,
                  background:C.bg,outline:"none",boxSizing:"border-box",WebkitAppearance:"none"}}/>
              <button onClick={confirmOther} disabled={!otherText.trim()}
                style={{flexShrink:0,padding:"0 20px",background:otherText.trim()?C.sage:C.subtle,
                  color:"#fff",border:"none",borderRadius:12,fontFamily:"inherit",fontSize:15,
                  fontWeight:600,cursor:otherText.trim()?"pointer":"default",
                  WebkitTapHighlightColor:"transparent"}}>Confirm</button>
            </div>
          </>
        ) : (
          <>
            <div style={{fontSize:16,fontWeight:600,color:C.text,margin:"4px 4px 16px"}}>
              What are you doing today?
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {SHEET_OPTIONS.map(opt=>(
                <button key={opt.action} onClick={()=>onSheetOption(opt)}
                  style={{display:"flex",flexDirection:"column",alignItems:"center",
                    justifyContent:"center",gap:5,minHeight:64,padding:"12px 4px",
                    background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,
                    cursor:"pointer",fontFamily:"inherit",WebkitTapHighlightColor:"transparent"}}>
                  <span style={{fontSize:24,lineHeight:1}}>{opt.emoji}</span>
                  <span style={{fontSize:11,color:C.muted,textAlign:"center",lineHeight:1.15}}>{opt.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function TodayView({plan,updDay,onEdit,dayOff,setDayOff,onOpenCoach}) {
  const viewKey=offsetDate(dayOff);
  const e=plan[viewKey]||{};
  const isToday=dayOff===0;
  const [editingKm,setEditingKm]=useState(false);
  const [kmInput,setKmInput]=useState("");
  const [sheetOpen,setSheetOpen]=useState(false);   // swap-arrows change-workout sheet
  const [direction,setDirection]=useState(null);    // 'left' | 'right' — day-slide direction
  const [animating,setAnimating]=useState(false);   // day-change slide in progress
  const [notesOpen,setNotesOpen]=useState(false);   // notes textarea expanded for editing
  useEffect(()=>{ setNotesOpen(false); },[viewKey]); // collapse the notes editor on day change

  const navDay=(delta)=>{
    setEditingKm(false); setSheetOpen(false);
    // Left swipe / › (next day) → new content enters from the right (slideInLeft).
    // Right swipe / ‹ (prev day) → enters from the left (slideInRight).
    setDirection(delta>0?'left':'right');
    setDayOff(o=>o+delta);
    setAnimating(true);
    setTimeout(()=>setAnimating(false),250);
  };
  const swipe=useSwipe(()=>navDay(1),()=>navDay(-1));
  const completeRun=()=>updDay(viewKey,{completed:true,kmDone:e.km||0});
  const adjustKm=(delta)=>{
    const next=Math.max(0,parseFloat((ran+delta).toFixed(1)));
    updDay(viewKey,{kmDone:next});
  };
  const openKmEdit=()=>{ setKmInput(fmtKm(ran)); setEditingKm(true); };
  const confirmKmEdit=()=>{
    const v=parseFloat(kmInput);
    if (!isNaN(v)) updDay(viewKey,{kmDone:v});
    setEditingKm(false);
  };
  // Unlogged running sessions: stepper adjusts the planned distance (e.km).
  const adjustPlannedKm=(delta)=>updDay(viewKey,{km:Math.max(0,parseFloat(((e.km||0)+delta).toFixed(1)))});
  const openPlannedKmEdit=()=>{ setKmInput(fmtKm(e.km||0)); setEditingKm(true); };
  const confirmPlannedKmEdit=()=>{
    const v=parseFloat(kmInput);
    if (!isNaN(v)) updDay(viewKey,{km:v});
    setEditingKm(false);
  };

  const d=new Date(viewKey+"T00:00:00");
  const dayName=d.toLocaleDateString("en-US",{weekday:"long"});
  const dayFull=d.toLocaleDateString("en-US",{month:"long",day:"numeric"});
  const hasKm=(e.km||0)>0;
  const target=plannedKm(e);
  const ran=actualKm(e);

  const wk=weekOf(0);
  const wkTarget=wk.reduce((s,dk)=>s+origKm(plan[dk]),0);
  const wkDone=wk.reduce((s,dk)=>s+actualKm(plan[dk]),0);
  const now=new Date();
  const mDays=monthGrid(now.getFullYear(),now.getMonth()).filter(Boolean);
  const mTarget=mDays.reduce((s,dk)=>s+origKm(plan[dk]),0);
  const mDone=mDays.reduce((s,dk)=>s+actualKm(plan[dk]),0);

  return (
    <div {...swipe} style={{padding:"16px 16px 24px"}}>
      <style>{"@keyframes checkPop{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}@keyframes slideInLeft{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideInRight{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}"}</style>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {[
          {
            // Running: planned km (green once done). Non-running: the workout emoji.
            // Genuinely empty day: "Rest".
            node: hasKm
              ? <span style={{color:e.completed?C.done:C.text}}>{fmtKm(e.completed?ran:target)} km</span>
              : e.workout?.trim()
                ? (ALTS.find(a=>e.workout.includes(a.label))?.emoji ?? '⚡')
                : 'Rest',
            lbl: "Today",
          },
          {
            // Green only counts km actually run; the planned total stays neutral.
            node: wkTarget>0
              ? <><span style={{color:wkDone>0?C.done:C.text}}>{fmtKm(wkDone)}</span>/{fmtKm(wkTarget)}<span style={{fontSize:11,color:C.muted,fontWeight:500}}> km</span></>
              : "—",
            lbl: "This week",
          },
          {
            node: mTarget>0
              ? <><span style={{color:mDone>0?C.done:C.text}}>{fmtKm(mDone)}</span>/{fmtKm(mTarget)}<span style={{fontSize:11,color:C.muted,fontWeight:500}}> km</span></>
              : "—",
            lbl: new Date().toLocaleDateString('en-US',{month:'long'}).toUpperCase(),
          },
        ].map(({node,lbl},i)=>(
          <div key={i} style={{background:C.surface,border:`1px solid ${C.border}`,
            borderRadius:14,padding:"12px 6px",textAlign:"center"}}>
            <div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,
              color:C.text,lineHeight:1.2}}>{node}</div>
            <div style={{fontSize:10,color:C.muted,marginTop:4,textTransform:"uppercase",
              letterSpacing:".05em"}}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Day content — slides on day change; the stats above stay fixed. */}
      <div style={{overflow:"hidden"}}>
      <div key={dayOff} style={{animation:animating?`${direction==="left"?"slideInLeft":"slideInRight"} 220ms ease-out`:undefined}}>
      {/* Day navigation */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <NavArrow onClick={()=>navDay(-1)} dir="left"/>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:11,fontWeight:700,marginBottom:2,
            color:isToday?C.sage:C.muted,
            textTransform:"uppercase",letterSpacing:".1em"}}>
            {isToday?"Today":dayOff<0?`${Math.abs(dayOff)} day${Math.abs(dayOff)>1?"s":""} ago`:`In ${dayOff} day${dayOff>1?"s":""}`}
          </div>
          <div style={{fontSize:17,fontWeight:600,color:C.text}}>{dayName}, {dayFull}</div>
          {!isToday&&<button onClick={()=>setDayOff(0)} style={{
            fontSize:11,fontWeight:700,color:C.sage,background:C.sageLt,
            border:"none",borderRadius:20,padding:"4px 12px",cursor:"pointer",
            marginTop:4,display:"inline-flex",alignItems:"center",gap:4,
            WebkitTapHighlightColor:"transparent"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Today</button>}
        </div>
        <NavArrow onClick={()=>navDay(1)} dir="right"/>
      </div>

      {/* Workout card */}
      <div style={{background:e.completed?C.doneLt:C.surface,
        border:`1px solid ${e.completed?C.done:C.border}`,
        borderRadius:18,padding:"20px 20px 16px"}}>

        {/* Name + check */}
        <div style={{display:"flex",justifyContent:"space-between",
          alignItems:"flex-start",gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:600,lineHeight:1.35,
              color:e.workout?.trim()?C.text:C.muted,
              fontStyle:e.workout?.trim()?"normal":"italic"}}>
              {e.workout?.trim()||"Rest day"}
            </div>
          </div>
          {/* No circle on genuine rest days — nothing to log. */}
          {e.workout?.trim()&&(e.completed
            ? <button onClick={()=>updDay(viewKey,{completed:false,kmDone:null})}
                aria-label="Completed — tap to undo"
                style={{width:64,height:64,borderRadius:"50%",border:"none",
                  background:C.done,cursor:"pointer",display:"flex",flexShrink:0,
                  alignItems:"center",justifyContent:"center",
                  animation:"checkPop .35s ease-out",
                  WebkitTapHighlightColor:"transparent"}}><Chk size={22}/></button>
            : <button onClick={hasKm?completeRun:()=>updDay(viewKey,{completed:true})}
                aria-label="Mark as done"
                style={{width:64,height:64,borderRadius:"50%",
                  border:`2.5px solid ${C.sage}`,background:C.sageLt,cursor:"pointer",
                  display:"flex",flexShrink:0,alignItems:"center",justifyContent:"center",
                  WebkitTapHighlightColor:"transparent"}}>
                <span style={{fontSize:11,fontWeight:700,color:C.sageDk,letterSpacing:'.08em'}}>LOG</span>
              </button>
          )}
          <button onClick={()=>setSheetOpen(true)} aria-label="Change workout"
            style={{width:44,height:44,border:"none",background:"transparent",color:C.muted,
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,marginTop:10,WebkitTapHighlightColor:"transparent"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 16V4m0 0L3 8m4-4l4 4"/>
              <path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
            </svg>
          </button>
        </div>

        {/* ── Tip ── */}
        <TipCard workout={e.workout}/>

        {/* km */}
        {hasKm&&(
          <div style={{marginTop:16,paddingTop:16,
            borderTop:`1px solid ${e.completed?"rgba(114,173,106,.2)":C.border}`}}>
            {e.completed
              ? editingKm
                ? <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <input type="text" inputMode="decimal"
                      value={kmInput} onChange={ev=>setKmInput(ev.target.value)}
                      autoFocus
                      style={{width:90,border:`1.5px solid ${C.borderSt}`,borderRadius:12,
                        padding:"10px 12px",fontFamily:"monospace",fontSize:22,fontWeight:700,
                        color:C.text,background:C.surface,outline:"none",
                        boxSizing:"border-box",textAlign:"center",WebkitAppearance:"none"}}/>
                    <span style={{fontSize:17,color:C.muted}}>km</span>
                    <button onClick={confirmKmEdit} style={{padding:"10px 16px",
                      background:C.done,color:"#fff",border:"none",borderRadius:10,
                      fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:"pointer",
                      WebkitTapHighlightColor:"transparent"}}>✓</button>
                    <button onClick={()=>setEditingKm(false)} style={{padding:"10px 12px",
                      background:"none",border:`1px solid ${C.border}`,borderRadius:10,
                      fontFamily:"inherit",fontSize:13,cursor:"pointer",color:C.muted,
                      WebkitTapHighlightColor:"transparent"}}>✕</button>
                  </div>
                : <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <button onClick={()=>adjustKm(-0.5)} style={{width:44,height:44,
                      borderRadius:"50%",background:C.bg,border:`1px solid ${C.border}`,
                      fontSize:24,cursor:"pointer",color:C.text,display:"flex",
                      alignItems:"center",justifyContent:"center",flexShrink:0,
                      WebkitTapHighlightColor:"transparent"}}>−</button>
                    <div onClick={openKmEdit} style={{flex:1,textAlign:"center",cursor:"pointer"}}>
                      <KmBig value={ran} color={C.done}/>
                      <span style={{fontSize:20,color:C.done,fontWeight:500}}> km</span>
                      <div style={{fontSize:11,color:C.subtle,marginTop:3}}>
                        {ran!==target?`${fmtKm(target)} planned · `:""}tap to edit
                      </div>
                    </div>
                    <button onClick={()=>adjustKm(0.5)} style={{width:44,height:44,
                      borderRadius:"50%",background:C.bg,border:`1px solid ${C.border}`,
                      fontSize:24,cursor:"pointer",color:C.text,display:"flex",
                      alignItems:"center",justifyContent:"center",flexShrink:0,
                      WebkitTapHighlightColor:"transparent"}}>+</button>
                  </div>
              : editingKm
                ? <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <input type="text" inputMode="decimal"
                      value={kmInput} onChange={ev=>setKmInput(ev.target.value)}
                      autoFocus
                      style={{width:90,border:`1.5px solid ${C.borderSt}`,borderRadius:12,
                        padding:"10px 12px",fontFamily:"monospace",fontSize:22,fontWeight:700,
                        color:C.text,background:C.surface,outline:"none",
                        boxSizing:"border-box",textAlign:"center",WebkitAppearance:"none"}}/>
                    <span style={{fontSize:17,color:C.muted}}>km</span>
                    <button onClick={confirmPlannedKmEdit} style={{padding:"10px 16px",
                      background:C.sage,color:"#fff",border:"none",borderRadius:10,
                      fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:"pointer",
                      WebkitTapHighlightColor:"transparent"}}>✓</button>
                    <button onClick={()=>setEditingKm(false)} style={{padding:"10px 12px",
                      background:"none",border:`1px solid ${C.border}`,borderRadius:10,
                      fontFamily:"inherit",fontSize:13,cursor:"pointer",color:C.muted,
                      WebkitTapHighlightColor:"transparent"}}>✕</button>
                  </div>
                : <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <button onClick={()=>adjustPlannedKm(-0.5)} style={{width:44,height:44,
                      borderRadius:"50%",background:C.bg,border:`1px solid ${C.border}`,
                      fontSize:24,cursor:"pointer",color:C.text,display:"flex",
                      alignItems:"center",justifyContent:"center",flexShrink:0,
                      WebkitTapHighlightColor:"transparent"}}>−</button>
                    <div onClick={openPlannedKmEdit} style={{flex:1,textAlign:"center",cursor:"pointer"}}>
                      <KmBig value={target} color={C.sage}/>
                      <span style={{fontSize:20,color:C.sage,fontWeight:500}}> km</span>
                      <div style={{fontSize:11,color:C.subtle,marginTop:3}}>tap to type exact</div>
                    </div>
                    <button onClick={()=>adjustPlannedKm(0.5)} style={{width:44,height:44,
                      borderRadius:"50%",background:C.bg,border:`1px solid ${C.border}`,
                      fontSize:24,cursor:"pointer",color:C.text,display:"flex",
                      alignItems:"center",justifyContent:"center",flexShrink:0,
                      WebkitTapHighlightColor:"transparent"}}>+</button>
                  </div>
            }
          </div>
        )}

        {/* Feeling rating — shown when completed */}
        {e.completed&&(
          <div style={{marginTop:12,paddingTop:12,
            borderTop:`1px solid rgba(114,173,106,.2)`}}>
            {e.feeling
              ? <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:24}}>{FEELINGS.find(f=>f.value===e.feeling)?.emoji}</span>
                  <span style={{fontSize:13,color:C.muted}}>
                    {FEELINGS.find(f=>f.value===e.feeling)?.label}
                  </span>
                  <button onClick={()=>updDay(viewKey,{feeling:null})}
                    style={{fontSize:11,color:C.muted,background:"none",border:"none",
                      cursor:"pointer",marginLeft:"auto",
                      WebkitTapHighlightColor:"transparent"}}>change</button>
                </div>
              : <div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:8,
                    textTransform:"uppercase",letterSpacing:".06em"}}>How did it feel?</div>
                  <div style={{display:"flex",gap:8}}>
                    {FEELINGS.map(f=>(
                      <button key={f.value} onClick={()=>updDay(viewKey,{feeling:f.value})}
                        title={f.label} aria-label={f.label}
                        style={{fontSize:22,background:"none",
                          border:`1px solid ${C.border}`,borderRadius:12,
                          width:44,height:44,display:"flex",alignItems:"center",
                          justifyContent:"center",flexShrink:0,cursor:"pointer",
                          WebkitTapHighlightColor:"transparent"}}>
                        {f.emoji}
                      </button>
                    ))}
                  </div>
                </div>
            }
          </div>
        )}

        {/* Notes — collapsible */}
        {notesOpen ? (
          <textarea rows={2} autoFocus placeholder="Notes — how it felt, conditions…"
            value={e.notes||""} onChange={ev=>updDay(viewKey,{notes:ev.target.value})}
            onBlur={()=>setNotesOpen(false)}
            style={{width:"100%",marginTop:14,border:`1px solid ${C.border}`,
              borderRadius:12,padding:"11px 14px",fontFamily:"inherit",fontSize:15,
              color:C.text,background:e.completed?"rgba(255,255,255,.5)":C.bg,
              resize:"none",outline:"none",lineHeight:1.5,boxSizing:"border-box"}}/>
        ) : (e.notes||"").trim() ? (
          <div onClick={()=>setNotesOpen(true)}
            style={{display:"flex",alignItems:"flex-start",gap:8,marginTop:14,cursor:"pointer",
              WebkitTapHighlightColor:"transparent"}}>
            <p style={{margin:0,flex:1,fontSize:14,color:C.text,lineHeight:1.55,
              whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{e.notes}</p>
            <span style={{fontSize:13,color:C.muted,flexShrink:0,lineHeight:1.55}}>✏️</span>
          </div>
        ) : (
          <button onClick={()=>setNotesOpen(true)}
            style={{marginTop:14,background:"none",border:"none",cursor:"pointer",
              color:C.muted,fontSize:13,fontWeight:500,padding:"4px 0",
              WebkitTapHighlightColor:"transparent"}}>📝 Add note</button>
        )}

      </div>
      </div>{/* /key wrapper */}
      </div>{/* /overflow wrapper */}

      {/* Ask the coach — opens the full-screen coach. */}
      {e.workout?.trim()&&(
        <button onClick={onOpenCoach} style={{width:"100%",marginTop:16,padding:"14px",
          background:"transparent",color:C.sageDk,border:`1.5px solid ${C.sage}`,borderRadius:12,
          fontFamily:"inherit",fontSize:15,fontWeight:600,cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          WebkitTapHighlightColor:"transparent"}}>
          💬 Ask the coach
        </button>
      )}

      {/* ⋯ Edit-actions bottom sheet */}
      {sheetOpen&&(
        <WorkoutSheet dateKey={viewKey} entry={e} updDay={updDay} onEdit={onEdit}
          onClose={()=>setSheetOpen(false)}/>
      )}
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────
function WeekView({today,plan,wkOff,setWkOff,onGoToDay,updDay,onEdit,onSwapDays}) {
  const days=weekOf(wkOff);
  const fmt=dk=>new Date(dk+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const wkTarget=days.reduce((s,dk)=>s+origKm(plan[dk]),0);
  const wkDone=days.reduce((s,dk)=>s+actualKm(plan[dk]),0);
  const [direction,setDirection]=useState(null);   // 'left' | 'right' — week-slide direction
  const [animating,setAnimating]=useState(false);
  const [sheetDk,setSheetDk]=useState(null);        // day whose change-workout sheet is open
  const [swapFrom,setSwapFrom]=useState(null);      // first day picked for a two-day swap
  const navWeek=(delta)=>{
    // Next week → content enters from the right (slideInLeft); previous → from the left (slideInRight).
    setSwapFrom(null);
    setDirection(delta>0?'left':'right');
    setWkOff(w=>w+delta);
    setAnimating(true);
    setTimeout(()=>setAnimating(false),250);
  };
  const swipe=useSwipe(()=>navWeek(1),()=>navWeek(-1));

  // Tap a day card to swap: first tap selects, second tap on a different day exchanges
  // their workout/km (logged data stays with its date), tapping the same day cancels.
  const onCardTap=(dk)=>{
    if (swapFrom===null) setSwapFrom(dk);
    else if (swapFrom===dk) setSwapFrom(null);
    else { onSwapDays(swapFrom,dk); setSwapFrom(null); }
  };
  const openSheet=(dk)=>{ setSwapFrom(null); setSheetDk(dk); };

  return (
    <div {...swipe} onClick={()=>{ if(swapFrom!==null) setSwapFrom(null); }}
      style={{padding:"16px 16px 0"}}>
      <style>{"@keyframes slideInLeft{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideInRight{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}"}</style>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <NavArrow onClick={()=>navWeek(-1)} dir="left"/>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:13,color:C.muted}}>{fmt(days[0])} – {fmt(days[6])}</div>
          {wkTarget>0&&(
            <div style={{fontSize:15,fontWeight:700,fontFamily:"monospace",marginTop:2}}>
              <span style={{color:wkDone>0?C.done:C.muted}}>{fmtKm(wkDone)}</span>
              <span style={{color:C.subtle}}> / {fmtKm(wkTarget)} km</span>
            </div>
          )}
          {wkOff!==0&&<button onClick={()=>setWkOff(0)} style={{
            fontSize:11,fontWeight:700,color:C.sage,background:C.sageLt,
            border:"none",borderRadius:20,padding:"4px 12px",cursor:"pointer",
            marginTop:4,display:"inline-flex",alignItems:"center",gap:4,
            WebkitTapHighlightColor:"transparent"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Today</button>}
        </div>
        <NavArrow onClick={()=>navWeek(1)} dir="right"/>
      </div>

      {/* Swap-mode banner — hint + cancel pill, shown while a day is selected */}
      {swapFrom!==null&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,
          marginBottom:14,padding:"10px 14px",background:C.sageLt,borderRadius:12}}>
          <span style={{fontSize:13,fontWeight:600,color:C.sageDk}}>Tap another day to swap workouts</span>
          <button onClick={(ev)=>{ ev.stopPropagation(); setSwapFrom(null); }}
            style={{flexShrink:0,fontSize:12,fontWeight:700,color:C.muted,background:C.surface,
              border:`1px solid ${C.border}`,borderRadius:20,padding:"5px 12px",cursor:"pointer",
              WebkitTapHighlightColor:"transparent"}}>✕ Cancel swap</button>
        </div>
      )}

      {/* Animated content — strip + day list slide on week change; nav row stays fixed. */}
      <div style={{overflow:"hidden"}}>
      <div key={wkOff} style={{animation:animating?`${direction==="left"?"slideInLeft":"slideInRight"} 220ms ease-out`:undefined}}>
      {/* Strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:16}}>
        {days.map((dk,i)=>{
          const e=plan[dk]||{};
          const isT=dk===today;
          const hasKm=(e.km||0)>0;
          return (
            <button key={dk} onClick={()=>onGoToDay(dk)}
              aria-label={`${DN[i]}, ${new Date(dk+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})} — ${e.workout?.trim()||"Rest"}`}
              style={{
              display:"block",width:"100%",fontFamily:"inherit",
              background:e.completed?C.doneLt:isT?C.sageLt:C.surface,
              border:`1.5px solid ${e.completed?C.done:isT?C.sage:C.border}`,
              borderRadius:12,padding:"13px 2px 11px",textAlign:"center",cursor:"pointer",
              WebkitTapHighlightColor:"transparent"}}>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:".04em",
                color:isT?C.sage:C.muted,fontWeight:isT?600:400,marginBottom:3}}>{DL[i]}</div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4}}>
                {new Date(dk+"T00:00:00").getDate()}
              </div>
              <div style={{fontSize:9,fontWeight:700,lineHeight:1,
                color:e.completed?C.done:hasKm?C.warm:C.subtle}}>
                {e.completed?`${fmtKm(actualKm(e))}k`:hasKm?`${fmtKm(e.km)}k`:"·"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day list — tap a card to pick it for a swap; ⇅ opens the change-workout sheet */}
      {days.map((dk,i)=>{
        const e=plan[dk]||{};
        const isT=dk===today;
        const d=new Date(dk+"T00:00:00");
        const target=plannedKm(e);
        const ran=actualKm(e);
        const picked=swapFrom===dk;
        return (
          <div key={dk} style={{
            background:picked?C.sageLt:e.completed?C.doneLt:C.surface,
            border:`${picked?2:1}px solid ${picked?C.sage:e.completed?C.done:C.border}`,
            borderRadius:16,padding:"14px 18px",marginBottom:10,
            display:"flex",alignItems:"center",gap:8}}>
            <button onClick={(ev)=>{ ev.stopPropagation(); onCardTap(dk); }}
              aria-label={`${DN[i]}, ${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})} — ${e.workout?.trim()||"Rest"}${picked?" (selected — tap another day to swap)":""}`}
              style={{flex:1,minWidth:0,display:"flex",justifyContent:"space-between",
                alignItems:"center",gap:10,background:"none",border:"none",padding:0,
                textAlign:"left",fontFamily:"inherit",cursor:"pointer",
                WebkitTapHighlightColor:"transparent"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".07em",
                  color:isT?C.sageDk:C.muted,fontWeight:isT?700:400,marginBottom:4}}>
                  {isT?"● Today  ·  ":""}{DN[i]}, {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                </div>
                <div style={{fontSize:15,fontWeight:500,
                  color:e.workout?.trim()?C.text:C.muted,
                  fontStyle:e.workout?.trim()?"normal":"italic",
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {e.workout?.trim()||"Rest"}
                </div>
              </div>
              {target>0&&(
                <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                  <div style={{fontSize:17,fontWeight:700,fontFamily:"monospace",
                    color:e.completed?C.done:C.sage}}>
                    {fmtKm(e.completed?ran:target)} km
                  </div>
                  {e.completed&&ran!==target&&(
                    <div style={{fontSize:11,color:C.muted}}>{fmtKm(target)} planned</div>
                  )}
                </div>
              )}
              {/* Passive completion-status indicator. */}
              <div style={{width:22,display:"flex",justifyContent:"center",
                alignItems:"center",flexShrink:0}}>
                {e.completed
                  ? <div style={{width:22,height:22,borderRadius:"50%",background:C.done,
                      display:"flex",alignItems:"center",justifyContent:"center"}}><Chk size={12}/></div>
                  : <div style={{width:8,height:8,borderRadius:"50%",background:C.border}}/>}
              </div>
            </button>
            {/* ⇅ change workout — opens the same bottom sheet as the Today view */}
            <button onClick={(ev)=>{ ev.stopPropagation(); openSheet(dk); }}
              aria-label="Change workout"
              style={{width:40,height:40,flexShrink:0,border:"none",background:"transparent",
                color:C.muted,cursor:"pointer",display:"flex",alignItems:"center",
                justifyContent:"center",WebkitTapHighlightColor:"transparent"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4"/>
                <path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </button>
          </div>
        );
      })}
      </div>{/* /week-slide */}
      </div>{/* /overflow */}

      {sheetDk&&(
        <WorkoutSheet dateKey={sheetDk} entry={plan[sheetDk]||{}} updDay={updDay} onEdit={onEdit}
          onClose={()=>setSheetDk(null)}/>
      )}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────
function MonthView({today,plan,moOff,setMoOff,onGoToDay}) {
  const now=new Date();
  const t=new Date(now.getFullYear(),now.getMonth()+moOff,1);
  const y=t.getFullYear(), m=t.getMonth();
  const days=monthGrid(y,m);
  const mTarget=days.filter(Boolean).reduce((s,dk)=>s+origKm(plan[dk]),0);
  const mDone=days.filter(Boolean).reduce((s,dk)=>s+actualKm(plan[dk]),0);
  const [direction,setDirection]=useState(null);   // 'left' | 'right' — month-slide direction
  const [animating,setAnimating]=useState(false);
  const navMonth=(delta)=>{
    // Next month → content enters from the right (slideInLeft); previous → from the left (slideInRight).
    setDirection(delta>0?'left':'right');
    setMoOff(o=>o+delta);
    setAnimating(true);
    setTimeout(()=>setAnimating(false),250);
  };
  const swipe=useSwipe(()=>navMonth(1),()=>navMonth(-1));

  return (
    <div {...swipe} style={{padding:"16px 16px 0"}}>
      <style>{"@keyframes slideInLeft{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideInRight{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}"}</style>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <NavArrow onClick={()=>navMonth(-1)} dir="left"/>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:700,color:C.text}}>{MONTHS[m]} {y}</div>
          {mTarget>0&&(
            <div style={{fontSize:13,color:C.muted,marginTop:2,fontFamily:"monospace"}}>
              <span style={{color:mDone>0?C.done:C.muted,fontWeight:700}}>{fmtKm(mDone)}</span>
              <span> / {fmtKm(mTarget)} km</span>
            </div>
          )}
          {moOff!==0&&<button onClick={()=>setMoOff(0)} style={{
            fontSize:11,fontWeight:700,color:C.sage,background:C.sageLt,
            border:"none",borderRadius:20,padding:"4px 12px",cursor:"pointer",
            marginTop:4,display:"inline-flex",alignItems:"center",gap:4,
            WebkitTapHighlightColor:"transparent"}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Today</button>}
        </div>
        <NavArrow onClick={()=>navMonth(1)} dir="right"/>
      </div>
      {/* Animated content — calendar grid slides on month change; nav row stays fixed. */}
      <div style={{overflow:"hidden"}}>
      <div key={moOff} style={{animation:animating?`${direction==="left"?"slideInLeft":"slideInRight"} 220ms ease-out`:undefined}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {DL.map((l,i)=>(
          <div key={i} style={{fontSize:10,textTransform:"uppercase",letterSpacing:".04em",
            color:C.muted,textAlign:"center",padding:"4px 0",fontWeight:500}}>{l}</div>
        ))}
        {days.map((dk,i)=>{
          if (!dk) return <div key={`e${i}`}/>;
          const e=plan[dk]||{};
          const hasKm=(e.km||0)>0;
          const hasWorkout=!!e.workout?.trim();
          const isT=dk===today;
          return (
            <button key={dk} onClick={()=>onGoToDay(dk)}
              aria-label={`${new Date(dk+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} — ${e.workout?.trim()||"Rest"}`}
              style={{
              width:"100%",padding:0,fontFamily:"inherit",
              aspectRatio:"1",borderRadius:10,display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:2,cursor:"pointer",
              background:e.completed?C.doneLt:hasWorkout?C.surface:"transparent",
              border:`1.5px solid ${e.completed?C.done:isT?C.sage:hasWorkout?C.border:"transparent"}`,
              outline:isT?`2px solid ${C.sage}`:"none",outlineOffset:-1,
              WebkitTapHighlightColor:"transparent"}}>
              {/* Dim days with no planned session so workout days stand out. */}
              <div style={{fontSize:13,fontWeight:(hasWorkout||isT)?600:400,
                color:(hasWorkout||isT)?C.text:C.borderSt,lineHeight:1}}>
                {new Date(dk+"T00:00:00").getDate()}
              </div>
              {/* Running days show km; non-running sessions show their workout emoji. */}
              {hasKm
                ? <div style={{fontSize:9,fontWeight:700,fontFamily:"monospace",lineHeight:1,
                    color:e.completed?C.done:C.warm}}>
                    {e.completed?`${fmtKm(actualKm(e))}k`:`${fmtKm(e.km)}k`}
                  </div>
                : hasWorkout
                  ? <div style={{fontSize:12,lineHeight:1,color:e.completed?C.done:undefined}}>
                      {ALTS.find(a=>e.workout?.includes(a.label))?.emoji||"⚡"}
                    </div>
                  : null}
            </button>
          );
        })}
      </div>
      </div>{/* /month-slide */}
      </div>{/* /overflow */}
    </div>
  );
}

// ─── Journey view ───────────────────────────────────────────────────────────────
const PHASES = [
  { name: 'Base', weeks: [1,2,3,4], description: 'Building your running foundation. Tendons, joints and fascia adapting to the load. Keep everything easy.' },
  { name: 'Build', weeks: [5,6,7,8], description: 'First quality sessions introduced. Volume increases deliberately. Your aerobic engine is growing.' },
  { name: 'Peak', weeks: [9,10,11,12], description: 'Highest training load of the plan. Your longest runs happen here. Trust the process even when it feels hard.' },
  { name: 'Taper', weeks: [13,14,15,16], description: 'Volume drops, sharpness maintained. Your body is consolidating 16 weeks of work. Resist the urge to do more.' },
  { name: 'Race Week', weeks: [17], description: 'Stay off your feet. Eat well. Sleep. The hay is in the barn.' },
];
const DELOAD_WEEKS = [4,8,12];   // cutback/recovery weeks within the plan

function JourneyView({plan,today,raceDate,onGoToWeek}) {
  const planStart=new Date(2026,5,29);                 // Week 1 = Mon Jun 29 2026
  const weekMonday=(N)=>{ const d=new Date(planStart); d.setDate(d.getDate()+(N-1)*7); return d; };
  const weekDays=(N)=>{ const m=weekMonday(N); return Array.from({length:7},(_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return dateKey(d); }); };
  const fmtMD=(d)=>d.toLocaleDateString("en-US",{month:"short",day:"numeric"});

  const todayD=new Date(today+"T00:00:00");
  const curWeek=Math.min(17,Math.max(1,Math.floor((todayD-planStart)/(7*86400000))+1));

  const weekStats=(N)=>{
    const entries=weekDays(N).map(dk=>plan[dk]||{});
    const planned=entries.reduce((s,e)=>s+origKm(e),0);
    const done=entries.reduce((s,e)=>s+actualKm(e),0);
    const longRun=entries.reduce((mx,e)=>Math.max(mx,origKm(e)),0);
    const started=entries.some(e=>e.completed);   // any session in the week completed
    return {planned,done,longRun,started};
  };


  return (
    <div style={{padding:"16px 16px 32px"}}>
      {/* Phases */}
      {PHASES.map((phase,pi)=>{
        const phasePlanned=phase.weeks.reduce((s,N)=>s+weekStats(N).planned,0);
        return (
          <div key={phase.name} style={{marginBottom:30}}>
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span style={{fontSize:22,fontWeight:800,color:C.text}}>{phase.name}</span>
                <span style={{fontSize:11,fontWeight:700,color:C.sage,textTransform:"uppercase",letterSpacing:".08em"}}>Phase {pi+1}</span>
              </div>
              <div style={{fontSize:13,color:C.muted,lineHeight:1.5,marginTop:5}}>{phase.description}</div>
              <div style={{fontSize:12,fontWeight:600,color:C.sageDk,fontFamily:"monospace",marginTop:6}}>{fmtKm(phasePlanned)} km planned</div>
            </div>

            {phase.weeks.map(N=>{
              const {planned,done,longRun,started}=weekStats(N);
              const days=weekDays(N);
              const mon=days[0];
              const isCurrent=N===curWeek;
              const isDeload=DELOAD_WEEKS.includes(N);
              const isFuture=new Date(mon+"T00:00:00")>todayD;   // Monday strictly after today
              const pct=planned>0?Math.min(1,done/planned):0;
              const barPct=isFuture?0:pct;                       // future weeks: no green fill
              const showDone=!isFuture&&started;                 // started, non-future → done/planned
              const range=`${fmtMD(new Date(mon+"T00:00:00"))} – ${fmtMD(new Date(days[6]+"T00:00:00"))}`;
              return (
                <div key={N}>
                  <button onClick={()=>onGoToWeek(mon)} aria-label={`Week ${N}, ${range}`}
                    style={{display:"block",width:"100%",textAlign:"left",background:"none",
                    border:"none",cursor:"pointer",fontFamily:"inherit",
                    borderLeft:`3px solid ${isCurrent?C.sage:"transparent"}`,
                    padding:"12px 0 12px 14px",WebkitTapHighlightColor:"transparent"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:14,fontWeight:700,color:isCurrent?C.sageDk:C.text}}>Wk {N}</span>
                        <span style={{fontSize:12,color:C.muted}}>· {range}</span>
                        {isDeload&&<span style={{fontSize:10,fontWeight:700,color:C.sageDk,
                          background:C.sageLt,borderRadius:20,padding:"2px 8px"}}>↓ Recovery</span>}
                      </div>
                      {longRun>0&&(
                        <div style={{flexShrink:0,textAlign:"right"}}>
                          <span style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:C.sage}}>{fmtKm(longRun)}</span>
                          <span style={{fontSize:11,color:C.muted}}>{N===17?" km · Race Day":" km longest run"}</span>
                        </div>
                      )}
                    </div>
                    <div style={{height:6,background:"rgba(196,168,130,0.3)",borderRadius:3,marginTop:8,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.round(barPct*100)}%`,background:C.done}}/>
                    </div>
                    <div style={{fontSize:12,color:C.muted,fontFamily:"monospace",marginTop:8}}>
                      {showDone
                        ? <><span style={{color:C.done}}>{fmtKm(done)}</span> / {fmtKm(planned)} km</>
                        : `${fmtKm(planned)} km planned`}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Coach screen (full-screen chat) ────────────────────────────────────────────
function CoachScreen({viewKey,plan,athleteName,raceName,raceDate,startDate,onBack}) {
  const [messages,setMessages]=useState([]);   // [{role:"user"|"assistant",content}]
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const [coachError,setCoachError]=useState(false);
  const coachKey=`coach-${viewKey}`;
  const inputRef=useRef(null);

  // Auto-focus the input on open; the 300ms delay lets the screen transition
  // finish first so the keyboard doesn't fire mid-animation and cause a jump.
  useEffect(()=>{
    const t=setTimeout(()=>inputRef.current?.focus(),300);
    return ()=>clearTimeout(t);
  },[]);

  // Load this day's saved conversation on mount.
  useEffect(()=>{
    let stored=[];
    try { const raw=localStorage.getItem(coachKey); if (raw) stored=JSON.parse(raw); } catch {}
    setMessages(Array.isArray(stored)?stored:[]);
  },[coachKey]);
  const persistCoach=(msgs)=>{ try { localStorage.setItem(coachKey,JSON.stringify(msgs)); } catch {} };

  // ── Coach context — the athlete's full plan view for this day ──
  const e=plan[viewKey]||{};
  const d=new Date(viewKey+"T00:00:00");
  const dayName=d.toLocaleDateString("en-US",{weekday:"long"});
  const dayFull=d.toLocaleDateString("en-US",{month:"long",day:"numeric"});
  const target=plannedKm(e), ran=actualKm(e);
  const wk=weekOf(0);
  const wkTarget=wk.reduce((s,dk)=>s+origKm(plan[dk]),0);
  const wkDone=wk.reduce((s,dk)=>s+actualKm(plan[dk]),0);
  const now=new Date();
  const mDays=monthGrid(now.getFullYear(),now.getMonth()).filter(Boolean);
  const mTarget=mDays.reduce((s,dk)=>s+origKm(plan[dk]),0);
  const mDone=mDays.reduce((s,dk)=>s+actualKm(plan[dk]),0);
  const feelingLabel=(v)=>FEELINGS.find(f=>f.value===v)?.label||null;
  const feelingEmoji=(v)=>FEELINGS.find(f=>f.value===v)?.emoji||null;
  const buildCoachContext=()=>{
    const today=todayStr();
    const dates=Object.keys(plan).filter(dk=>plan[dk]?.workout?.trim()).sort();
    const history=[], upcoming=[];
    for (const dk of dates) {
      const re=plan[dk];
      if (re.completed) {
        history.push({date:dk,workout:re.workout.trim(),plannedKm:plannedKm(re),
          kmDone:actualKm(re),feeling:feelingLabel(re.feeling),emoji:feelingEmoji(re.feeling),
          notes:re.notes?.trim()||null});
      } else if (dk>today&&(!raceDate||dk<=raceDate)) {
        upcoming.push({date:dk,workout:re.workout.trim(),km:plannedKm(re)});
      }
    }
    const dleft=daysUntil(raceDate);
    return {
      athleteName:athleteName?.trim()||null,
      raceName,raceDate,today,daysUntilRace:dleft,phase:phaseFor(dleft),
      day:{date:viewKey,label:`${dayName}, ${dayFull}`,workout:e.workout,
        plannedKm:target,actualKm:ran,completed:!!e.completed,feeling:feelingLabel(e.feeling)},
      history,upcoming,
      week:{doneKm:wkDone,plannedKm:wkTarget},
      month:{doneKm:mDone,plannedKm:mTarget},
    };
  };

  const sendToCoach=async(base)=>{
    setSending(true); setCoachError(false);
    setMessages([...base,{role:"assistant",content:""}]);
    try {
      const resp=await fetch("/api/coach",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...buildCoachContext(),messages:base})});
      if (!resp.ok||!resp.body) throw new Error("bad response");
      const reader=resp.body.getReader(), decoder=new TextDecoder();
      let acc="";
      for (;;) { const {done,value}=await reader.read(); if (done) break; acc+=decoder.decode(value,{stream:true}); setMessages([...base,{role:"assistant",content:acc}]); }
      if (!acc.trim()) throw new Error("empty response");
      const final=[...base,{role:"assistant",content:acc}];
      setMessages(final); persistCoach(final);
    } catch { setCoachError(true); setMessages(base); }
    finally { setSending(false); }
  };
  const startCoach=()=>sendToCoach([{role:"user",content:"Tell me about today's session"}]);
  const sendCoach=()=>{ const text=input.trim(); if (!text||sending) return; setInput(""); sendToCoach([...messages,{role:"user",content:text}]); };
  const retryCoach=()=>{ if (!sending&&messages.length) sendToCoach(messages); };
  const newCoachChat=()=>{ setMessages([]); setInput(""); setCoachError(false); try { localStorage.removeItem(coachKey); } catch {} };

  return (
    <div style={{position:"fixed",inset:0,zIndex:60,background:C.bg,
      display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif"}}>
      <style>{"@keyframes coachBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}"}</style>
      {/* Header */}
      <div style={{flexShrink:0,background:C.surface,borderBottom:`1px solid ${C.border}`,
        padding:"env(safe-area-inset-top,0px) 12px 0",display:"flex",alignItems:"center",
        gap:8,minHeight:56}}>
        <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",
          color:C.muted,fontSize:24,width:44,height:44,display:"flex",alignItems:"center",
          justifyContent:"center",flexShrink:0,WebkitTapHighlightColor:"transparent"}}>←</button>
        <div style={{flex:1,textAlign:"center",fontSize:16,fontWeight:700,color:C.text}}>Coach</div>
        {messages.length>0
          ? <button onClick={newCoachChat} style={{background:"none",border:"none",cursor:"pointer",
              color:C.muted,fontSize:12,fontWeight:600,textDecoration:"underline",padding:"0 6px",
              flexShrink:0,WebkitTapHighlightColor:"transparent"}}>New conversation</button>
          : <div style={{width:44,flexShrink:0}}/>}
      </div>

      {/* Messages — fills remaining height, scrollable */}
      <div style={{flex:1,minHeight:0,overflowY:"auto",padding:16,
        display:"flex",flexDirection:"column",gap:10}}>
        {messages.length===0&&!input.trim()&&!coachError&&(
          <button onClick={startCoach} disabled={sending}
            style={{alignSelf:"stretch",padding:"14px",background:C.surface,
              color:C.sageDk,border:`1px solid ${C.sage}`,borderRadius:12,
              fontFamily:"inherit",fontSize:15,fontWeight:600,
              cursor:sending?"default":"pointer",WebkitTapHighlightColor:"transparent"}}>
            Tell me about today's session
          </button>
        )}
        {messages.map((m,i)=>(
          m.role==="assistant"
            ? <div key={i} style={{alignSelf:"flex-start",maxWidth:"90%",
                background:C.surface,borderLeft:`3px solid ${C.sage}`,
                borderRadius:"4px 14px 14px 4px",padding:"11px 14px"}}>
                {m.content
                  ? <p style={{margin:0,fontSize:15,lineHeight:1.6,color:C.text,whiteSpace:"pre-wrap"}}>{m.content}</p>
                  : <div style={{display:"flex",gap:5,padding:"2px 0"}}>
                      {[0,1,2].map(j=>(<span key={j} style={{width:7,height:7,borderRadius:"50%",
                        background:C.sage,display:"inline-block",
                        animation:`coachBlink 1.2s ${j*0.16}s infinite ease-in-out`}}/>))}
                    </div>}
              </div>
            : <div key={i} style={{alignSelf:"flex-end",maxWidth:"85%",
                background:C.surface,border:`1px solid ${C.border}`,
                borderRadius:"14px 14px 4px 14px",padding:"11px 14px"}}>
                <p style={{margin:0,fontSize:15,lineHeight:1.55,color:C.text,whiteSpace:"pre-wrap"}}>{m.content}</p>
              </div>
        ))}
        {coachError&&(
          <div style={{alignSelf:"stretch"}}>
            <p style={{margin:"0 0 8px",fontSize:14,color:C.muted,lineHeight:1.5}}>
              Couldn't reach the coach right now. Check your connection and try again.
            </p>
            {messages.length>0&&(
              <button onClick={retryCoach} style={{fontSize:14,fontWeight:600,
                color:C.sageDk,background:C.surface,border:`1px solid ${C.sage}`,
                borderRadius:10,padding:"9px 16px",cursor:"pointer",fontFamily:"inherit",
                WebkitTapHighlightColor:"transparent"}}>↻ Try again</button>
            )}
          </div>
        )}
      </div>

      {/* Input bar — pinned at the bottom above the safe area */}
      <div style={{flexShrink:0,background:C.surface,borderTop:`1px solid ${C.border}`,
        padding:"10px 16px calc(2px + env(safe-area-inset-bottom,0px))",
        display:"flex",gap:8,alignItems:"center"}}>
        <input ref={inputRef} type="text" value={input}
          onChange={ev=>setInput(ev.target.value)}
          onKeyDown={ev=>{ if (ev.key==="Enter"){ ev.preventDefault(); sendCoach(); } }}
          placeholder="Ask the coach…" disabled={sending}
          style={{flex:1,border:`1px solid ${C.border}`,borderRadius:12,
            padding:"12px 14px",fontFamily:"inherit",fontSize:15,color:C.text,
            background:C.bg,outline:"none",boxSizing:"border-box",WebkitAppearance:"none"}}/>
        <button onClick={sendCoach} disabled={sending||!input.trim()}
          style={{padding:"14px 18px",background:input.trim()&&!sending?C.sage:C.border,
            color:"#fff",border:"none",borderRadius:12,fontFamily:"inherit",fontSize:14,fontWeight:600,
            cursor:input.trim()&&!sending?"pointer":"default",flexShrink:0,
            WebkitTapHighlightColor:"transparent"}}>Send</button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [loading,setLoading]=useState(true);
  const [name,setName]=useState("");
  const [athleteName,setAthleteName]=useState("");
  const [raceDate,setRaceDate]=useState("");
  const [startDate,setStartDate]=useState("");
  const [plan,setPlan]=useState({});
  const [view,setView]=useState("today");
  const [screen,setScreen]=useState("main");
  const [editKey,setEditKey]=useState(null);
  const [editEntry,setEditEntry]=useState(null);   // optional override entry for the editor
  const [editIsRun,setEditIsRun]=useState(false);  // editor opened for a run (RUN TYPE label)
  const [wkOff,setWkOff]=useState(0);
  const [moOff,setMoOff]=useState(0);
  const [dayOff,setDayOff]=useState(0);   // which day the Today view shows (offset from today)
  const [restoredToast,setRestoredToast]=useState(false);   // brief "Backup restored" confirmation after import
  const [celebration,setCelebration]=useState(null);        // milestone overlay: {emoji,title,message} | null

  useEffect(()=>{
    (async()=>{
      let stored=null;
      try { stored=await storeGet(SK); } catch(e) {}
      if (stored) {
        try {
          const d=JSON.parse(stored);
          if(d.name) setName(d.name);
          if(d.athleteName) setAthleteName(d.athleteName);
          if(d.raceDate) setRaceDate(d.raceDate);
          if(d.startDate) setStartDate(d.startDate);
          const lp=(d.plan&&Object.keys(d.plan).length>0)?d.plan:buildDefaultPlan();
          setPlan(lp);
          setScreen(d.name&&d.raceDate?"main":"setup");
        } catch(e) { setScreen("setup"); }
      } else {
        const dp=buildDefaultPlan();
        setName("Marathon 2026"); setRaceDate("2026-10-25");
        setStartDate("2026-06-26"); setPlan(dp);
        try { await storeSet(SK,JSON.stringify({
          name:"Marathon 2026",raceDate:"2026-10-25",
          startDate:"2026-06-26",plan:dp}));
        } catch(e) {}
        setScreen("main");
      }
      setLoading(false);
    })();
  },[]);

  // Respect prefers-reduced-motion globally: neutralise keyframe animations and
  // transitions, and give keyboard users a visible focus ring. Injected once.
  useEffect(()=>{
    if (document.getElementById("a11y-global-style")) return;
    const s=document.createElement("style");
    s.id="a11y-global-style";
    s.textContent="@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms !important;animation-iteration-count:1 !important;transition-duration:.001ms !important;scroll-behavior:auto !important}}:focus-visible{outline:2px solid #8B9E8A !important;outline-offset:2px !important}@keyframes celebFadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}";
    document.head.appendChild(s);
  },[]);

  // Surface a one-shot "Backup restored" toast after a restore reload (the flag
  // is set just before window.location.reload in SetupScreen.confirmImport).
  useEffect(()=>{
    try { if (sessionStorage.getItem("justRestored")) { sessionStorage.removeItem("justRestored"); setRestoredToast(true); } } catch {}
  },[]);
  useEffect(()=>{
    if (!restoredToast) return;
    const t=setTimeout(()=>setRestoredToast(false),3200);
    return ()=>clearTimeout(t);
  },[restoredToast]);
  // Auto-dismiss the milestone overlay after 4s (tap also dismisses).
  useEffect(()=>{
    if (!celebration) return;
    const t=setTimeout(()=>setCelebration(null),4000);
    return ()=>clearTimeout(t);
  },[celebration]);

  // After a run is logged, fire the first not-yet-shown milestone whose check passes.
  // Reads the just-updated plan so the new run is counted; entry is its copy so the
  // personal-longest reference check excludes it correctly. One celebration at a time.
  const checkMilestones=(dateKey,planState)=>{
    const allEntries=Object.entries(planState)
      .filter(([k,e])=>e.completed&&e.kmDone)
      .map(([k,e])=>({...e,date:k}));
    const entry=allEntries.find(e=>e.date===dateKey);
    if (!entry) return;
    const totalKm=allEntries.reduce((sum,e)=>sum+(e.kmDone||0),0);
    for (const m of MILESTONES) {
      const sk=`milestone-${m.id}`;
      let already=false;
      try { already=!!localStorage.getItem(sk); } catch {}
      if (already) continue;
      if (m.check(entry,totalKm,allEntries)) {
        try { localStorage.setItem(sk,'true'); } catch {}
        setCelebration({emoji:m.emoji,title:m.title,message:m.message});
        break;
      }
    }
  };

  const save=(np,nn,nr,ns,na)=>storeSet(SK,JSON.stringify({
    name:nn??name,athleteName:na??athleteName,raceDate:nr??raceDate,startDate:ns??startDate,plan:np??plan
  })).catch(()=>{});
  const updDay=(dk,u)=>{
    const np={...plan,[dk]:{...plan[dk],...u}}; setPlan(np); save(np);
    // Only running sessions celebrate — completed with a logged distance.
    if (u.completed===true&&np[dk]?.kmDone>0) checkMilestones(dk,np);
  };
  // Swap two days' plan (workout/km/plannedKm) in a single atomic update — two
  // sequential updDay calls would each read the same stale `plan` and clobber one
  // change. Logged data (kmDone/completed/feeling/notes) stays with its own date.
  const swapDays=(a,b)=>{
    const ea=plan[a]||{}, eb=plan[b]||{};
    const np={...plan,
      [a]:{...plan[a],workout:eb.workout||'',km:eb.km??null,plannedKm:eb.plannedKm??null},
      [b]:{...plan[b],workout:ea.workout||'',km:ea.km??null,plannedKm:ea.plannedKm??null}};
    setPlan(np); save(np);
  };
  const openEdit=(dk,entryOverride,isRun)=>{ setEditKey(dk); setEditEntry(entryOverride||null); setEditIsRun(!!isRun); setScreen("editday"); };
  // Tapping a day in Week/Month jumps to that day in the Today view.
  const goToDay=(dk)=>{ setDayOff(daysUntil(dk)??0); setView("today"); };
  // Tapping a week in Journey jumps to that week in the Week view.
  const goToWeek=(mondayDk)=>{
    const curMon=new Date(weekOf(0)[0]+"T00:00:00").getTime();
    const tgtMon=new Date(mondayDk+"T00:00:00").getTime();
    setWkOff(Math.round((tgtMon-curMon)/(7*86400000)));
    setView("week");
  };

  const today=todayStr();
  const dLeft=daysUntil(raceDate);
  const totalDays=(startDate&&raceDate)
    ?Math.max(1,Math.ceil((new Date(raceDate+"T00:00:00")-new Date(startDate+"T00:00:00"))/86400000)):121;
  const allE=Object.values(plan);
  const totalPlanned=allE.filter(e=>e.workout?.trim()).length;
  const totalDone=allE.filter(e=>e.completed).length;
  const pct=totalPlanned>0?Math.round(totalDone/totalPlanned*100):0;
  const totalKmDone=allE.reduce((s,e)=>s+actualKm(e),0);
  const totalKmPlanned=allE.reduce((s,e)=>s+origKm(e),0);
  const circ=2*Math.PI*30;
  const ringOff=dLeft!==null?circ*Math.max(0,Math.min(1,dLeft/totalDays)):circ;
  const raceCompleted=!!(raceDate&&plan[raceDate]?.completed);

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100vh",color:C.muted,fontFamily:"system-ui",background:C.bg}}>Loading…</div>
  );
  if(screen==="setup") return (
    <SetupScreen initName={name} initAthlete={athleteName} isEdit={!!name}
      onBack={name?()=>setScreen("main"):null}
      onSave={(athlete,n)=>{
        const sd=todayStr(); setAthleteName(athlete); setName(n);
        const ns=startDate||sd; if(!startDate) setStartDate(ns);
        const rd=raceDate||"2026-10-25"; if(!raceDate) setRaceDate(rd);  // race date is fixed
        save(plan,n,rd,ns,athlete); setScreen("main");
      }}/>
  );
  if(screen==="editday"&&editKey) return (
    <EditDayScreen dateKey={editKey} entry={editEntry||plan[editKey]||{}} isRun={editIsRun}
      onBack={()=>setScreen("main")}
      onSave={(u)=>{ updDay(editKey,u); setScreen("main"); }}/>
  );
  if(screen==="coach") return (
    <CoachScreen viewKey={offsetDate(dayOff)} plan={plan}
      athleteName={athleteName} raceName={name} raceDate={raceDate} startDate={startDate}
      onBack={()=>setScreen("main")}/>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,
      fontFamily:"system-ui,-apple-system,sans-serif",color:C.text,
      paddingBottom:"env(safe-area-inset-bottom,0px)",
      WebkitFontSmoothing:"antialiased"}}>

      {/* One-shot restore confirmation */}
      {restoredToast&&(
        <div role="status" style={{position:"fixed",left:0,right:0,zIndex:70,
          top:"calc(env(safe-area-inset-top,0px) + 12px)",display:"flex",
          justifyContent:"center",pointerEvents:"none"}}>
          <div style={{background:C.done,color:"#fff",fontSize:14,fontWeight:600,
            padding:"10px 18px",borderRadius:99,display:"flex",alignItems:"center",gap:8,
            boxShadow:"0 4px 16px rgba(0,0,0,0.18)"}}>
            <Chk size={15}/> Backup restored
          </div>
        </div>
      )}

      {/* Milestone celebration overlay */}
      {celebration && (
        <div onClick={() => setCelebration(null)} style={{
          position:'fixed', inset:0, zIndex:1000,
          background:'rgba(139,158,138,0.92)',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          padding:40, textAlign:'center',
          animation:'celebFadeIn 0.3s ease'
        }}>
          <div style={{fontSize:72, marginBottom:24}}>{celebration.emoji}</div>
          <div style={{fontSize:26, fontWeight:800, color:'#fff', marginBottom:16, lineHeight:1.2}}>
            {celebration.title}
          </div>
          <div style={{fontSize:17, color:'rgba(255,255,255,0.85)', lineHeight:1.6, maxWidth:280}}>
            {celebration.message}
          </div>
          <div style={{marginTop:40, fontSize:13, color:'rgba(255,255,255,0.6)'}}>
            tap to continue
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,
        paddingTop:"env(safe-area-inset-top,0px)"}}>
        <div style={{padding:"14px 20px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",
            alignItems:"flex-start",marginBottom:14}}>
            <div>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".08em",
                color:C.muted,marginBottom:3}}>Marathon tracker</div>
              <div style={{fontSize:22,fontWeight:700,color:C.text,lineHeight:1.15}}>{name}</div>
            </div>
            <button onClick={()=>setScreen("setup")} style={{
              background:"none",border:`1px solid ${C.border}`,borderRadius:10,
              width:44,height:44,cursor:"pointer",display:"flex",
              alignItems:"center",justifyContent:"center",
              color:C.muted,flexShrink:0,
              WebkitTapHighlightColor:"transparent"}} aria-label="Race settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>

          <div style={{display:"flex",gap:16,alignItems:"center",paddingBottom:16}}>
            <div style={{position:"relative",width:72,height:72,flexShrink:0}}>
              <svg width="72" height="72" style={{transform:"rotate(-90deg)"}}>
                <circle cx="36" cy="36" r="30" fill="none" stroke={C.border} strokeWidth="5.5"/>
                <circle cx="36" cy="36" r="30" fill="none"
                  stroke={raceCompleted?C.warm:C.sage} strokeWidth="5.5"
                  strokeLinecap="round" strokeDasharray={circ}
                  strokeDashoffset={raceCompleted?0:ringOff}
                  style={{transition:"stroke-dashoffset .8s ease"}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",
                flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                {raceCompleted
                  ? <span style={{fontSize:28,lineHeight:1}}>🏆</span>
                  : <>
                      <span style={{fontFamily:"monospace",fontSize:20,fontWeight:700,
                        lineHeight:1,color:C.text}}>{dLeft!==null?Math.max(0,dLeft):"–"}</span>
                      <span style={{fontSize:9,color:C.muted,textTransform:"uppercase",
                        letterSpacing:".06em",marginTop:2}}>days</span>
                    </>
                }
              </div>
            </div>
            <div style={{flex:1}}>
              {raceCompleted
                ? <>
                    <div style={{fontSize:17,fontWeight:700,color:C.warm,marginBottom:4}}>
                      You did it! 🎉
                    </div>
                    <div style={{fontSize:13,color:C.muted,marginBottom:2}}>
                      {fmtKm(totalKmDone)} km over {totalDone} sessions
                    </div>
                    <div style={{fontSize:12,color:C.muted}}>{pct}% of plan completed</div>
                  </>
                : <>
                    <div style={{fontSize:12,color:C.muted,marginBottom:5}}>
                      {raceDate?new Date(raceDate+"T00:00:00").toLocaleDateString("en-US",
                        {weekday:"short",month:"long",day:"numeric",year:"numeric"}):""}
                    </div>
                    <div style={{fontSize:14,marginBottom:4}}>
                      <span style={{color:C.done,fontFamily:"monospace",fontWeight:700,fontSize:15}}>
                        {fmtKm(totalKmDone)} km
                      </span>
                      <span style={{color:C.muted}}> of {fmtKm(totalKmPlanned)} km</span>
                    </div>
                    <div style={{fontSize:12,color:C.muted,marginBottom:7}}>
                      {totalDone}/{totalPlanned} sessions · {pct}%
                    </div>
                    <div style={{height:5,background:C.border,borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",background:C.sage,borderRadius:99,
                        width:`${pct}%`,transition:"width .6s ease"}}/>
                    </div>
                  </>
              }
            </div>
          </div>

        </div>
      </div>

      <div style={{paddingBottom:"calc(80px + env(safe-area-inset-bottom,0px))"}}>
        {view==="today"&&<TodayView plan={plan} updDay={updDay} onEdit={openEdit} dayOff={dayOff} setDayOff={setDayOff} onOpenCoach={()=>setScreen("coach")}/>}
        {view==="week"&&<WeekView today={today} plan={plan} wkOff={wkOff} setWkOff={setWkOff} onGoToDay={goToDay} updDay={updDay} onEdit={openEdit} onSwapDays={swapDays}/>}
        {view==="month"&&<MonthView today={today} plan={plan} moOff={moOff} setMoOff={setMoOff} onGoToDay={goToDay}/>}
        {view==="journey"&&<JourneyView plan={plan} today={today} raceDate={raceDate} onGoToWeek={goToWeek}/>}
      </div>

      {/* Bottom tab bar — fixed in the thumb zone. Content is anchored to the bottom
          (flex-end) so labels sit just above the safe-area inset, like native iOS
          tab bars, rather than floating centred in a tall bar. */}
      <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:40,
        background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",
        paddingTop:6,paddingBottom:"env(safe-area-inset-bottom,0px)",
        boxShadow:"0 -2px 14px rgba(0,0,0,0.05)"}}>
        {[["today","Today"],["week","Week"],["month","Month"],["journey","Journey"]].map(([v,label])=>{
          const active=view===v;
          return (
            <button key={v} onClick={()=>{ setView(v); if(v==="today") setDayOff(0); }}
              aria-label={label} aria-current={active?"page":undefined}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"flex-end",gap:3,minHeight:48,padding:"6px 0 2px",
                background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
                color:active?C.sage:C.muted,WebkitTapHighlightColor:"transparent"}}>
              <TabIcon name={v}/>
              <span style={{fontSize:11,fontWeight:active?700:500,letterSpacing:".01em"}}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
