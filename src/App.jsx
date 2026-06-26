import { useState, useEffect } from "react";

const SK = "marathon-v6";
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
  if (w.includes("long run")) return TIPS.long;
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

const FEELINGS = [
  { value:1, emoji:"😫", label:"Dead legs" },
  { value:2, emoji:"😕", label:"Tough" },
  { value:3, emoji:"😐", label:"OK" },
  { value:4, emoji:"😊", label:"Good" },
  { value:5, emoji:"🔥", label:"Flying" },
];

// ─── 17-week plan (race Sun 25 Oct 2026) ─────────────────────────────────────
const PLAN_WEEKS = [
  [null,['Easy run',7],['Easy run',8],['Easy run',8],null,['Long run',16],['Easy recovery run',8]],
  [null,['Easy run',8],['Tempo run',9],['Easy run',10],null,['Long run',18],['Easy recovery run',8]],
  [null,['Easy run',10],['Tempo run',10],['Easy run',10],null,['Long run',21],['Easy recovery run',8]],
  [null,['Easy run',7],['Easy run',8],['Easy run',7],null,['Long run',15],['Easy recovery run',6]],
  [null,['Track session – 6×800m',11],['Easy run',12],['Easy run',10],null,['Long run',23],['Easy recovery run',10]],
  [null,['Tempo run',12],['Easy run',12],['Easy run',10],null,['Long run',25],['Easy recovery run',10]],
  [null,['Track session – 8×1km',14],['Easy run',12],['Easy run',12],null,['Long run',26],['Easy recovery run',10]],
  [null,['Easy run',8],['Easy run',10],['Easy run',8],null,['Long run',18],['Easy recovery run',6]],
  [null,['Tempo run',14],['Easy run',12],['Easy run',10],null,['Long run',28],['Easy recovery run',10]],
  [null,['Track session – 8×1km',14],['Easy run',12],['Easy run',10],null,['Long run',29],['Easy recovery run',10]],
  [['Easy run',8],['Tempo run',12],['Easy run',12],['Easy run',10],null,['Long run',30],['Easy recovery run',8]],
  [null,['Easy run',8],['Easy run',10],['Easy run',8],null,['Long run',18],['Easy recovery run',6]],
  [null,['Tempo run',10],['Easy run',10],['Easy run',8],null,['Long run',22],['Easy recovery run',8]],
  [null,['Sharpener – 5×1km',10],['Easy run',8],['Easy run',8],null,['Long run',18],['Easy recovery run',6]],
  [null,['Tempo run',8],['Easy run',8],['Easy run',6],null,['Long run',14],['Easy recovery run',6]],
  [null,['Easy run with strides',6],['Easy run',6],['Easy run',5],null,['Easy run',8],['Easy recovery run',5]],
  [null,['Easy jog with strides',5],['Easy jog',4],null,['Shake-out jog',3],null,['Marathon – Race Day',42.2]],
];

function buildDefaultPlan() {
  const plan = {};
  plan['2026-06-26'] = { workout:'First session – easy run', km:6 };
  plan['2026-06-27'] = { workout:'Long run', km:14 };
  plan['2026-06-28'] = { workout:'Easy recovery run', km:6 };
  PLAN_WEEKS.forEach((week,wi)=>{
    week.forEach((day,di)=>{
      const d=new Date(2026,5,29); d.setDate(d.getDate()+wi*7+di);
      if (day&&day[0]) plan[dateKey(d)]={ workout:day[0], km:day[1] };
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

// ─── Tip card ─────────────────────────────────────────────────────────────────
function TipCard({workout, compact=false}) {
  const tip = getTip(workout);
  if (!tip) return null;
  if (compact) {
    return (
      <span style={{
        display:"inline-block",fontSize:10,fontWeight:700,
        color:tip.color,background:tip.bg,
        borderRadius:20,padding:"3px 9px",marginTop:5,
      }}>{tip.label}</span>
    );
  }
  return (
    <div style={{
      marginTop:14,paddingTop:14,
      borderTop:`1px solid ${C.border}`,
    }}>
      <span style={{
        display:"inline-block",fontSize:11,fontWeight:700,
        color:tip.color,background:tip.bg,
        borderRadius:20,padding:"4px 11px",marginBottom:9,
      }}>{tip.label}</span>
      <p style={{
        margin:0,fontSize:13,color:C.muted,
        lineHeight:1.6,letterSpacing:"0.01em",
      }}>{tip.text}</p>
    </div>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────
function SetupScreen({initName,initDate,isEdit,onBack,onSave}) {
  const [n,setN]=useState(initName||"");
  const [d,setD]=useState(initDate||"");
  const ok=n.trim()&&d;
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
          Set your race day, load your plan, track every kilometre.
        </div>
      </>}
      <div style={{background:C.surface,border:`1px solid ${C.border}`,
        borderRadius:20,padding:24,width:"100%",maxWidth:400}}>
        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:8}}>Race name</label>
        <input style={inp} placeholder="e.g. Berlin Marathon 2026"
          value={n} onChange={e=>setN(e.target.value)}/>
        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:8,marginTop:20}}>Race date</label>
        <input style={inp} type="date" value={d} onChange={e=>setD(e.target.value)}/>
        <button disabled={!ok} onClick={()=>onSave(n.trim(),d)} style={{
          width:"100%",padding:16,background:ok?C.sage:C.subtle,color:"#fff",
          border:"none",borderRadius:14,fontFamily:"inherit",fontSize:17,fontWeight:600,
          cursor:ok?"pointer":"default",marginTop:24,
          WebkitTapHighlightColor:"transparent"}}>
          {isEdit?"Save changes":"Start training →"}
        </button>
      </div>
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

function EditDayScreen({dateKey:dk,entry,onSave,onBack}) {
  const initialKnown=!!entry.workout&&WORKOUT_OPTIONS.includes(entry.workout);
  const [workoutSel,setWorkoutSel]=useState(initialKnown?entry.workout:"Custom…");
  const [customWorkout,setCustomWorkout]=useState(initialKnown?"":(entry.workout||""));
  const [km,setKm]=useState(entry.km!=null?String(entry.km):"");
  const [kmTyping,setKmTyping]=useState(false);
  const [kmDone,setKmDone]=useState(entry.kmDone!=null?String(entry.kmDone):"");
  const [kmDoneTyping,setKmDoneTyping]=useState(false);
  const [completed,setCompleted]=useState(!!entry.completed);
  const [notes,setNotes]=useState(entry.notes||"");
  const workout=workoutSel==="Custom…"?customWorkout:workoutSel;
  const kmNum=parseFloat(km)||0;
  const kmDoneNum=parseFloat(kmDone)||0;
  const stepKm=(delta)=>setKm(String(Math.max(0,parseFloat((kmNum+delta).toFixed(1)))));
  const stepKmDone=(delta)=>setKmDone(String(Math.max(0,parseFloat((kmDoneNum+delta).toFixed(1)))));
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
          color:C.muted,display:"block",marginBottom:8}}>Workout</label>
        <select value={workoutSel} onChange={e=>setWorkoutSel(e.target.value)}
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

        {entry.completed&&<>
          <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
            color:C.muted,display:"block",marginBottom:10,marginTop:20}}>Actual km ran</label>
          <KmStepper value={kmDoneNum} onAdjust={stepKmDone} raw={kmDone} setRaw={setKmDone}
            typing={kmDoneTyping} setTyping={setKmDoneTyping} accent={C.done}/>
        </>}

        <label style={{fontSize:12,textTransform:"uppercase",letterSpacing:".08em",
          color:C.muted,display:"block",marginBottom:8,marginTop:20}}>Notes</label>
        <textarea style={{...inp2,resize:"none",lineHeight:1.6}} rows={3}
          placeholder="How it went · conditions · how you felt…"
          value={notes} onChange={e=>setNotes(e.target.value)}/>

        <div style={{display:"flex",alignItems:"center",gap:14,marginTop:12,padding:"8px 0",cursor:"pointer"}}
          onClick={()=>setCompleted(c=>!c)}>
          <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
            border:completed?"none":`2px solid ${C.borderSt}`,
            background:completed?C.done:"transparent",
            display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>
            {completed&&<Chk size={15}/>}
          </div>
          <span style={{fontSize:16,color:C.text}}>Mark as completed</span>
        </div>

        <div style={{display:"flex",gap:12,marginTop:28}}>
          <button onClick={onBack} style={{padding:"15px 20px",background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:14,fontFamily:"inherit",
            fontSize:15,cursor:"pointer",color:C.muted,
            WebkitTapHighlightColor:"transparent"}}>Cancel</button>
          <button onClick={()=>onSave({workout,km:parseFloat(km)||null,
            kmDone:parseFloat(kmDone)||null,completed,notes})}
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
function TodayView({plan,updDay,onEdit,raceName,raceDate}) {
  const [dayOff,setDayOff]=useState(0);
  const viewKey=offsetDate(dayOff);
  const e=plan[viewKey]||{};
  const isToday=dayOff===0;
  const [editingKm,setEditingKm]=useState(false);
  const [kmInput,setKmInput]=useState("");
  const [sheetOpen,setSheetOpen]=useState(false);   // ⋯ edit-actions bottom sheet

  // ── AI coach chat state ─────────────────────────────────────────────────────
  const [coachOpen,setCoachOpen]=useState(false);
  const [messages,setMessages]=useState([]);   // [{role:"user"|"assistant",content}]
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const [coachError,setCoachError]=useState(false);
  const coachKey=`coach-${viewKey}`;
  // Load this day's saved conversation; reset the chat whenever the day changes.
  useEffect(()=>{
    setCoachOpen(false); setInput(""); setSending(false); setCoachError(false);
    let stored=[];
    try { const raw=localStorage.getItem(coachKey); if (raw) stored=JSON.parse(raw); } catch {}
    setMessages(Array.isArray(stored)?stored:[]);
  },[viewKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const persistCoach=(msgs)=>{ try { localStorage.setItem(coachKey,JSON.stringify(msgs)); } catch {} };

  const navDay=(delta)=>{ setDayOff(o=>o+delta); setEditingKm(false); setSheetOpen(false); };
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

  const d=new Date(viewKey+"T00:00:00");
  const dayName=d.toLocaleDateString("en-US",{weekday:"long"});
  const dayFull=d.toLocaleDateString("en-US",{month:"long",day:"numeric"});
  const hasKm=(e.km||0)>0;
  const target=plannedKm(e);
  const ran=actualKm(e);

  const wk=weekOf(0);
  const wkTarget=wk.reduce((s,dk)=>s+plannedKm(plan[dk]),0);
  const wkDone=wk.reduce((s,dk)=>s+actualKm(plan[dk]),0);
  const now=new Date();
  const mDays=monthGrid(now.getFullYear(),now.getMonth()).filter(Boolean);
  const mTarget=mDays.reduce((s,dk)=>s+plannedKm(plan[dk]),0);
  const mDone=mDays.reduce((s,dk)=>s+actualKm(plan[dk]),0);

  // ── AI coach ──────────────────────────────────────────────────────────────
  const feelingLabel=(v)=>FEELINGS.find(f=>f.value===v)?.label||null;
  const feelingEmoji=(v)=>FEELINGS.find(f=>f.value===v)?.emoji||null;
  const buildCoachContext=()=>{
    const today=todayStr();
    // Give the coach the same view the athlete has: the full plan in both
    // directions. The server (buildContextBlock) decides how much detail to
    // render so the prompt stays within sensible token limits.
    const dates=Object.keys(plan).filter(dk=>plan[dk]?.workout?.trim()).sort();
    const history=[];   // every completed session, oldest first
    const upcoming=[];  // every remaining planned session through race day
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
      raceName,raceDate,today,daysUntilRace:dleft,phase:phaseFor(dleft),
      day:{date:viewKey,label:`${dayName}, ${dayFull}`,workout:e.workout,
        plannedKm:target,actualKm:ran,completed:!!e.completed,feeling:feelingLabel(e.feeling)},
      history,
      upcoming,
      week:{doneKm:wkDone,plannedKm:wkTarget},
      month:{doneKm:mDone,plannedKm:mTarget},
    };
  };
  // Send `base` (the conversation so far) to the coach and stream the reply.
  // An empty assistant message is appended for the live stream / typing dots.
  const sendToCoach=async(base)=>{
    setSending(true); setCoachError(false);
    setMessages([...base,{role:"assistant",content:""}]);
    try {
      const resp=await fetch("/api/coach",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...buildCoachContext(),messages:base}),
      });
      if (!resp.ok||!resp.body) throw new Error("bad response");
      const reader=resp.body.getReader(), decoder=new TextDecoder();
      let acc="";
      for (;;) {
        const {done,value}=await reader.read();
        if (done) break;
        acc+=decoder.decode(value,{stream:true});
        setMessages([...base,{role:"assistant",content:acc}]);
      }
      if (!acc.trim()) throw new Error("empty response");
      const final=[...base,{role:"assistant",content:acc}];
      setMessages(final); persistCoach(final);
    } catch {
      setCoachError(true);
      setMessages(base);            // drop the streaming placeholder
    } finally {
      setSending(false);
    }
  };
  const startCoach=()=>sendToCoach([{role:"user",content:"Tell me about today's session"}]);
  const sendCoach=()=>{
    const text=input.trim();
    if (!text||sending) return;
    setInput("");
    sendToCoach([...messages,{role:"user",content:text}]);
  };
  const retryCoach=()=>{ if (!sending&&messages.length) sendToCoach(messages); };
  const newCoachChat=()=>{
    setMessages([]); setInput(""); setCoachError(false);
    try { localStorage.removeItem(coachKey); } catch {}
  };

  // Shared style for the bottom-sheet action rows.
  const sheetRow={display:"flex",alignItems:"center",gap:6,width:"100%",
    background:"none",border:"none",borderRadius:12,padding:"14px 10px",
    fontFamily:"inherit",fontSize:16,fontWeight:500,color:C.text,cursor:"pointer",
    textAlign:"left",WebkitTapHighlightColor:"transparent"};

  return (
    <div style={{padding:"16px 16px 0"}}>
      <style>{"@keyframes checkPop{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}"}</style>
      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
        {[
          {
            // Planned km in normal colour until the run is logged; actual km in green once done.
            node: hasKm
              ? <span style={{color:e.completed?C.done:C.text}}>{fmtKm(e.completed?ran:target)} km</span>
              : "Rest",
            lbl: hasKm&&!e.completed ? "planned" : (isToday?"Today":d.toLocaleDateString("en-US",{weekday:"short"})),
          },
          {
            // Green only counts km actually run; the planned total stays neutral.
            node: wkTarget>0
              ? <><span style={{color:wkDone>0?C.done:C.text}}>{fmtKm(wkDone)}</span>/{fmtKm(wkTarget)}</>
              : "—",
            lbl: "km / week",
          },
          {
            node: mTarget>0
              ? <><span style={{color:mDone>0?C.done:C.text}}>{fmtKm(mDone)}</span>/{fmtKm(mTarget)}</>
              : "—",
            lbl: "km / month",
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
            marginTop:4,WebkitTapHighlightColor:"transparent"}}>↩ Today</button>}
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
          {e.completed
            ? <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                gap:5,flexShrink:0}}>
                <button onClick={()=>updDay(viewKey,{completed:false,kmDone:null})}
                  aria-label="Completed — tap to undo"
                  style={{width:64,height:64,borderRadius:"50%",border:"none",
                    background:C.done,cursor:"pointer",display:"flex",
                    alignItems:"center",justifyContent:"center",
                    animation:"checkPop .35s ease-out",
                    WebkitTapHighlightColor:"transparent"}}><Chk size={22}/></button>
                <span style={{fontSize:10,fontWeight:700,color:C.done,
                  textTransform:"uppercase",letterSpacing:".05em"}}>Done</span>
              </div>
            : <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                gap:5,flexShrink:0}}>
                <button onClick={hasKm?completeRun:()=>updDay(viewKey,{completed:true})}
                  aria-label="Mark run as done"
                  style={{width:64,height:64,borderRadius:"50%",
                    border:`2.5px solid ${C.sage}`,background:C.sageLt,
                    cursor:"pointer",
                    WebkitTapHighlightColor:"transparent"}}/>
                <span style={{fontSize:10,fontWeight:700,color:C.sageDk,
                  textTransform:"uppercase",letterSpacing:".05em"}}>Tap to log</span>
              </div>
          }
          <button onClick={()=>setSheetOpen(true)} aria-label="More options"
            style={{width:44,height:44,borderRadius:"50%",border:"none",
              background:"transparent",color:C.muted,fontSize:24,lineHeight:1,
              cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"center",flexShrink:0,marginTop:10,
              WebkitTapHighlightColor:"transparent"}}>⋯</button>
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
              : <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                  <KmBig value={target} color={C.sage}/>
                  <span style={{fontSize:20,color:C.sage,fontWeight:500}}>km</span>
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

        {/* Notes */}
        <textarea rows={2} placeholder="Notes — how it felt, conditions…"
          value={e.notes||""} onChange={ev=>updDay(viewKey,{notes:ev.target.value})}
          style={{width:"100%",marginTop:14,border:`1px solid ${C.border}`,
            borderRadius:12,padding:"11px 14px",fontFamily:"inherit",fontSize:15,
            color:C.text,background:e.completed?"rgba(255,255,255,.5)":C.bg,
            resize:"none",outline:"none",lineHeight:1.5,boxSizing:"border-box"}}/>

      </div>

      {/* AI coach — standalone section below the card */}
      {e.workout?.trim()&&(
        <div style={{marginTop:16}}>
            {!coachOpen
              ? <button onClick={()=>setCoachOpen(true)} style={{width:"100%",padding:"12px",
                  background:"transparent",color:C.sageDk,border:`1.5px solid ${C.sage}`,
                  borderRadius:12,fontFamily:"inherit",fontSize:15,fontWeight:600,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  WebkitTapHighlightColor:"transparent"}}>
                  💬 Ask the coach
                </button>
              : <div style={{background:C.sageLt,borderRadius:14,padding:"14px 16px",
                  borderLeft:`3px solid ${C.sage}`}}>
                  <style>{"@keyframes coachBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}"}</style>
                  <div style={{display:"flex",alignItems:"center",marginBottom:10}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.sageDk,
                      textTransform:"uppercase",letterSpacing:".07em"}}>🏃 Coach</span>
                    {messages.length>0&&(
                      <button onClick={newCoachChat}
                        style={{marginLeft:12,background:"none",border:"none",cursor:"pointer",
                          color:C.muted,fontSize:11,fontWeight:600,textDecoration:"underline",
                          padding:0,WebkitTapHighlightColor:"transparent"}}>New conversation</button>
                    )}
                    <button onClick={()=>setCoachOpen(false)} aria-label="Close coach"
                      style={{marginLeft:"auto",marginRight:-10,marginTop:-8,marginBottom:-8,
                        background:"none",border:"none",cursor:"pointer",color:C.muted,
                        fontSize:20,lineHeight:1,width:44,height:44,display:"flex",
                        alignItems:"center",justifyContent:"center",flexShrink:0,
                        WebkitTapHighlightColor:"transparent"}}>×</button>
                  </div>

                  {/* Messages */}
                  {messages.length>0&&(
                    <div style={{maxHeight:300,overflowY:"auto",display:"flex",
                      flexDirection:"column",gap:8,marginBottom:10}}>
                      {messages.map((m,i)=>(
                        m.role==="assistant"
                          ? <div key={i} style={{alignSelf:"flex-start",maxWidth:"92%",
                              background:C.surface,borderLeft:`3px solid ${C.sage}`,
                              borderRadius:"4px 12px 12px 4px",padding:"10px 12px"}}>
                              {m.content
                                ? <p style={{margin:0,fontSize:14,lineHeight:1.6,color:C.text,
                                    whiteSpace:"pre-wrap"}}>{m.content}</p>
                                : <div style={{display:"flex",gap:5,padding:"2px 0"}}>
                                    {[0,1,2].map(j=>(
                                      <span key={j} style={{width:7,height:7,borderRadius:"50%",
                                        background:C.sage,display:"inline-block",
                                        animation:`coachBlink 1.2s ${j*0.16}s infinite ease-in-out`}}/>
                                    ))}
                                  </div>}
                            </div>
                          : <div key={i} style={{alignSelf:"flex-end",maxWidth:"85%",
                              background:C.surface,border:`1px solid ${C.border}`,
                              borderRadius:"12px 12px 4px 12px",padding:"10px 12px"}}>
                              <p style={{margin:0,fontSize:14,lineHeight:1.55,color:C.text,
                                whiteSpace:"pre-wrap"}}>{m.content}</p>
                            </div>
                      ))}
                    </div>
                  )}

                  {/* Conversation starter — one-tap, only before any chat / typing */}
                  {messages.length===0&&!input.trim()&&(
                    <button onClick={startCoach} disabled={sending}
                      style={{width:"100%",padding:"13px 14px",background:C.surface,
                        color:C.sageDk,border:`1px solid ${C.sage}`,borderRadius:12,
                        fontFamily:"inherit",fontSize:14,fontWeight:600,
                        cursor:sending?"default":"pointer",marginBottom:10,
                        WebkitTapHighlightColor:"transparent"}}>
                      Tell me about today's session
                    </button>
                  )}

                  {coachError&&(
                    <div style={{marginBottom:10}}>
                      <p style={{margin:"0 0 8px",fontSize:13,color:C.muted,lineHeight:1.5}}>
                        Couldn't reach the coach right now. Check your connection and try again.
                      </p>
                      {messages.length>0&&(
                        <button onClick={retryCoach} style={{fontSize:13,fontWeight:600,
                          color:C.sageDk,background:C.surface,border:`1px solid ${C.sage}`,
                          borderRadius:10,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",
                          WebkitTapHighlightColor:"transparent"}}>↻ Try again</button>
                      )}
                    </div>
                  )}

                  {/* Input row */}
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <input type="text" value={input}
                      onChange={ev=>setInput(ev.target.value)}
                      onKeyDown={ev=>{ if (ev.key==="Enter"){ ev.preventDefault(); sendCoach(); } }}
                      placeholder="Ask the coach…" disabled={sending}
                      style={{flex:1,border:`1px solid ${C.border}`,borderRadius:12,
                        padding:"12px 14px",fontFamily:"inherit",fontSize:15,color:C.text,
                        background:C.surface,outline:"none",boxSizing:"border-box",
                        WebkitAppearance:"none"}}/>
                    <button onClick={sendCoach} disabled={sending||!input.trim()}
                      style={{padding:"14px 18px",background:input.trim()&&!sending?C.sage:C.border,
                        color:"#fff",border:"none",borderRadius:12,fontFamily:"inherit",
                        fontSize:14,fontWeight:600,
                        cursor:input.trim()&&!sending?"pointer":"default",flexShrink:0,
                        WebkitTapHighlightColor:"transparent"}}>Send</button>
                  </div>
                </div>
            }
          </div>
        )}

      {/* ⋯ Edit-actions bottom sheet */}
      {sheetOpen&&(
        <>
          <div onClick={()=>setSheetOpen(false)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:50,
              WebkitTapHighlightColor:"transparent"}}/>
          <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:51,
            maxWidth:480,margin:"0 auto",background:C.surface,
            borderRadius:"20px 20px 0 0",boxShadow:"0 -8px 30px rgba(0,0,0,0.18)",
            padding:"8px 16px calc(20px + env(safe-area-inset-bottom))",
            animation:"sheetUp .25s ease-out"}}>
            <style>{"@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}"}</style>
            {/* Tappable grab handle — tap (or tap outside) to dismiss. */}
            <button onClick={()=>setSheetOpen(false)} aria-label="Close"
              style={{display:"block",width:"100%",background:"none",border:"none",
                cursor:"pointer",padding:"6px 0 14px",WebkitTapHighlightColor:"transparent"}}>
              <div style={{width:40,height:5,borderRadius:3,background:C.borderSt,margin:"0 auto"}}/>
            </button>

            <button onClick={()=>{setSheetOpen(false);onEdit(viewKey);}} style={sheetRow}>
              ✏  Add / change run
            </button>
            {e.workout?.trim()&&(
              <button onClick={()=>{setSheetOpen(false);updDay(viewKey,{workout:'',km:null,kmDone:null,completed:false});}}
                style={{...sheetRow,color:"#c05050"}}>
                🗑  Remove workout
              </button>
            )}

            <div style={{fontSize:11,color:C.muted,margin:"16px 4px 10px",
              textTransform:"uppercase",letterSpacing:".06em"}}>Switch to</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {ALTS.filter(a=>!e.workout?.includes(a.label)).map(a=>(
                <button key={a.label}
                  onClick={()=>{setSheetOpen(false);updDay(viewKey,{workout:`${a.emoji} ${a.label}`,km:null,kmDone:null,completed:false});}}
                  style={{fontSize:14,color:C.text,background:C.bg,
                    border:`1px solid ${C.border}`,borderRadius:22,
                    padding:"12px 16px",cursor:"pointer",fontFamily:"inherit",
                    WebkitTapHighlightColor:"transparent"}}>
                  {a.emoji} {a.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────
function WeekView({today,plan,wkOff,setWkOff,onEdit}) {
  const days=weekOf(wkOff);
  const fmt=dk=>new Date(dk+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const wkTarget=days.reduce((s,dk)=>s+plannedKm(plan[dk]),0);
  const wkDone=days.reduce((s,dk)=>s+actualKm(plan[dk]),0);

  return (
    <div style={{padding:"16px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <NavArrow onClick={()=>setWkOff(w=>w-1)} dir="left"/>
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
            marginTop:4,WebkitTapHighlightColor:"transparent"}}>↩ Today</button>}
        </div>
        <NavArrow onClick={()=>setWkOff(w=>w+1)} dir="right"/>
      </div>

      {/* Strip */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5,marginBottom:16}}>
        {days.map((dk,i)=>{
          const e=plan[dk]||{};
          const isT=dk===today;
          const hasKm=(e.km||0)>0;
          return (
            <div key={dk} onClick={()=>onEdit(dk)} style={{
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
            </div>
          );
        })}
      </div>

      {/* Day list */}
      {days.map((dk,i)=>{
        const e=plan[dk]||{};
        const isT=dk===today;
        const d=new Date(dk+"T00:00:00");
        const target=plannedKm(e);
        const ran=actualKm(e);
        return (
          <div key={dk} onClick={()=>onEdit(dk)} style={{
            background:e.completed?C.doneLt:C.surface,
            border:`1px solid ${e.completed?C.done:C.border}`,
            borderRadius:16,padding:"14px 18px",marginBottom:10,cursor:"pointer",
            WebkitTapHighlightColor:"transparent"}}>
            <div style={{display:"flex",justifyContent:"space-between",
              alignItems:"center",gap:10}}>
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
                {/* Compact tip pill */}
                {e.workout?.trim()&&<TipCard workout={e.workout} compact/>}
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
              {/* Passive completion-status indicator (the whole row opens edit). */}
              <div style={{width:24,display:"flex",justifyContent:"center",
                alignItems:"center",flexShrink:0}}>
                {e.completed
                  ? <div style={{width:22,height:22,borderRadius:"50%",background:C.done,
                      display:"flex",alignItems:"center",justifyContent:"center"}}><Chk size={12}/></div>
                  : <div style={{width:8,height:8,borderRadius:"50%",background:C.border}}/>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month view ───────────────────────────────────────────────────────────────
function MonthView({today,plan,moOff,setMoOff,onEdit}) {
  const now=new Date();
  const t=new Date(now.getFullYear(),now.getMonth()+moOff,1);
  const y=t.getFullYear(), m=t.getMonth();
  const days=monthGrid(y,m);
  const mTarget=days.filter(Boolean).reduce((s,dk)=>s+plannedKm(plan[dk]),0);
  const mDone=days.filter(Boolean).reduce((s,dk)=>s+actualKm(plan[dk]),0);

  return (
    <div style={{padding:"16px 16px 0"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
        <NavArrow onClick={()=>setMoOff(m=>m-1)} dir="left"/>
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
            marginTop:4,WebkitTapHighlightColor:"transparent"}}>↩ Today</button>}
        </div>
        <NavArrow onClick={()=>setMoOff(m=>m+1)} dir="right"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {DL.map((l,i)=>(
          <div key={i} style={{fontSize:10,textTransform:"uppercase",letterSpacing:".04em",
            color:C.muted,textAlign:"center",padding:"4px 0",fontWeight:500}}>{l}</div>
        ))}
        {days.map((dk,i)=>{
          if (!dk) return <div key={`e${i}`}/>;
          const e=plan[dk]||{};
          const hasKm=(e.km||0)>0;
          const isT=dk===today;
          return (
            <div key={dk} onClick={()=>onEdit(dk)} style={{
              aspectRatio:"1",borderRadius:10,display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:2,cursor:"pointer",
              background:e.completed?C.doneLt:hasKm?C.surface:"transparent",
              border:`1.5px solid ${e.completed?C.done:isT?C.sage:hasKm?C.border:"transparent"}`,
              outline:isT?`2px solid ${C.sage}`:"none",outlineOffset:-1,
              WebkitTapHighlightColor:"transparent"}}>
              {/* Dim days with no planned session so workout days stand out. */}
              <div style={{fontSize:13,fontWeight:(hasKm||isT)?600:400,
                color:(hasKm||isT)?C.text:C.borderSt,lineHeight:1}}>
                {new Date(dk+"T00:00:00").getDate()}
              </div>
              {hasKm&&(
                <div style={{fontSize:9,fontWeight:700,fontFamily:"monospace",lineHeight:1,
                  color:e.completed?C.done:C.warm}}>
                  {e.completed?`${fmtKm(actualKm(e))}k`:`${fmtKm(e.km)}k`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [loading,setLoading]=useState(true);
  const [name,setName]=useState("");
  const [raceDate,setRaceDate]=useState("");
  const [startDate,setStartDate]=useState("");
  const [plan,setPlan]=useState({});
  const [view,setView]=useState("today");
  const [screen,setScreen]=useState("main");
  const [editKey,setEditKey]=useState(null);
  const [wkOff,setWkOff]=useState(0);
  const [moOff,setMoOff]=useState(0);

  useEffect(()=>{
    (async()=>{
      let stored=null;
      try { stored=await storeGet(SK); } catch(e) {}
      if (stored) {
        try {
          const d=JSON.parse(stored);
          if(d.name) setName(d.name);
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

  const save=(np,nn,nr,ns)=>storeSet(SK,JSON.stringify({
    name:nn??name,raceDate:nr??raceDate,startDate:ns??startDate,plan:np??plan
  })).catch(()=>{});
  const updDay=(dk,u)=>{ const np={...plan,[dk]:{...plan[dk],...u}}; setPlan(np); save(np); };
  const openEdit=(dk)=>{ setEditKey(dk); setScreen("editday"); };

  const today=todayStr();
  const dLeft=daysUntil(raceDate);
  const totalDays=(startDate&&raceDate)
    ?Math.max(1,Math.ceil((new Date(raceDate+"T00:00:00")-new Date(startDate+"T00:00:00"))/86400000)):121;
  const allE=Object.values(plan);
  const totalPlanned=allE.filter(e=>e.workout?.trim()).length;
  const totalDone=allE.filter(e=>e.completed).length;
  const pct=totalPlanned>0?Math.round(totalDone/totalPlanned*100):0;
  const totalKmDone=allE.reduce((s,e)=>s+actualKm(e),0);
  const totalKmPlanned=allE.reduce((s,e)=>s+plannedKm(e),0);
  const circ=2*Math.PI*30;
  const ringOff=dLeft!==null?circ*Math.max(0,Math.min(1,dLeft/totalDays)):circ;
  const raceCompleted=!!(raceDate&&plan[raceDate]?.completed);

  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100vh",color:C.muted,fontFamily:"system-ui",background:C.bg}}>Loading…</div>
  );
  if(screen==="setup") return (
    <SetupScreen initName={name} initDate={raceDate} isEdit={!!name}
      onBack={name?()=>setScreen("main"):null}
      onSave={(n,d)=>{
        const sd=todayStr(); setName(n); setRaceDate(d);
        const ns=startDate||sd; if(!startDate) setStartDate(ns);
        save(plan,n,d,ns); setScreen("main");
      }}/>
  );
  if(screen==="editday"&&editKey) return (
    <EditDayScreen dateKey={editKey} entry={plan[editKey]||{}}
      onBack={()=>setScreen("main")}
      onSave={(u)=>{ updDay(editKey,u); setScreen("main"); }}/>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,
      fontFamily:"system-ui,-apple-system,sans-serif",color:C.text,
      paddingBottom:"env(safe-area-inset-bottom,0px)",
      WebkitFontSmoothing:"antialiased"}}>

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
              color:C.muted,fontSize:18,flexShrink:0,
              WebkitTapHighlightColor:"transparent"}}>⚙</button>
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

          <div style={{display:"flex",borderTop:`1px solid ${C.border}`,
            marginLeft:-20,marginRight:-20,paddingLeft:20,paddingRight:20}}>
            {["today","week","month"].map(v=>(
              <button key={v} onClick={()=>setView(v)} style={{
                flex:1,padding:"13px 0",background:"none",border:"none",
                borderBottom:`2.5px solid ${view===v?C.sage:"transparent"}`,
                cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,
                color:view===v?C.sage:C.muted,
                WebkitTapHighlightColor:"transparent"}}>
                {v.charAt(0).toUpperCase()+v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{paddingBottom:32}}>
        {view==="today"&&<TodayView plan={plan} updDay={updDay} onEdit={openEdit} raceName={name} raceDate={raceDate}/>}
        {view==="week"&&<WeekView today={today} plan={plan} wkOff={wkOff} setWkOff={setWkOff} onEdit={openEdit}/>}
        {view==="month"&&<MonthView today={today} plan={plan} moOff={moOff} setMoOff={setMoOff} onEdit={openEdit}/>}
      </div>
    </div>
  );
}
