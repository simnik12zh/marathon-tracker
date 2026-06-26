import Anthropic from "@anthropic-ai/sdk";

// The model is a project decision documented in README.md — Sonnet 4.6 is fast
// enough for a mobile chat bubble while still giving strong coaching quality.
// Bump to "claude-opus-4-8" if you want maximum quality and can accept more latency.
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are an experienced, supportive marathon coach speaking directly to a runner through their training app.

Your job: when the runner asks about a session, explain it in context — what the workout is for, how it fits where they are in their plan, and how to approach it given how they've been feeling recently.

Guidelines:
- Be warm, concise and practical. Two to four short paragraphs, written for a phone screen. No markdown headers, no long bullet lists.
- Ground your advice in the data you're given (training phase, recent sessions, how they felt, weekly load). Reference it specifically when it's relevant — don't invent numbers you weren't given.
- If recent sessions felt hard (feeling 1–2 / "Dead legs", "Tough"), acknowledge the fatigue and adjust your advice. If they've been flying (4–5), encourage them without pushing recklessly.
- Speak plain English. Be honest — don't sugarcoat a genuinely hard session — but always leave them feeling capable.
- Never give medical advice. If they mention pain or injury, gently steer them toward rest and a professional.
- Address the runner directly as "you". Don't start with "Here is..." or restate the question — just talk to them.`;

function fmtKm(n) {
  if (!n) return "0";
  return n % 1 === 0 ? `${n}` : `${n.toFixed(1)}`;
}

// Return the YYYY-MM-DD string `n` days before the given YYYY-MM-DD date.
function daysBeforeStr(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Sessions completed within this many days of "now" get full detail; anything
// older is summarised to one line so the prompt stays bounded late in the plan.
const FULL_DETAIL_DAYS = 14;

// Render the athlete's full plan — history behind and road ahead — as a context
// block appended to the system prompt, so the coach always has the same view of
// the plan the athlete does, however long the chat grows.
function buildContextBlock(ctx) {
  const lines = [];
  lines.push("Here is the runner's full training plan — everything completed so far and everything still to come. This is the same view of the plan the runner has in the app. Ground your advice in it; don't invent numbers you weren't given.");
  lines.push("");
  lines.push(`Race: ${ctx.raceName || "the marathon"} on ${ctx.raceDate || "race day"}.`);
  if (ctx.daysUntilRace != null) {
    lines.push(`Days until race: ${ctx.daysUntilRace}.`);
  }
  if (ctx.phase) lines.push(`Current training phase: ${ctx.phase}.`);

  const d = ctx.day || {};
  lines.push("");
  lines.push("The session currently in view (what the runner is most likely asking about):");
  lines.push(`- Date: ${d.label || d.date || "today"}`);
  lines.push(`- Workout: ${d.workout?.trim() || "Rest day"}`);
  if (d.plannedKm) lines.push(`- Planned distance: ${fmtKm(d.plannedKm)} km`);
  if (d.completed) {
    lines.push(`- Status: completed (${fmtKm(d.actualKm)} km run)`);
    if (d.feeling) lines.push(`- How it felt: ${d.feeling}`);
  } else {
    lines.push(`- Status: not done yet`);
  }

  // Completed history (oldest first). Recent sessions in full; older ones get a
  // concise date + km + feeling-emoji line to keep the token count in check.
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  if (history.length) {
    const ref = ctx.today || d.date || null;
    const cutoff = ref ? daysBeforeStr(ref, FULL_DETAIL_DAYS) : null;
    const older = cutoff ? history.filter((h) => h.date < cutoff) : [];
    const recent = cutoff ? history.filter((h) => h.date >= cutoff) : history;

    lines.push("");
    lines.push(`Completed training history — ${history.length} session${history.length === 1 ? "" : "s"} so far, oldest first:`);
    if (older.length) {
      lines.push("Earlier sessions (summarised):");
      for (const h of older) {
        const emoji = h.emoji ? ` ${h.emoji}` : "";
        lines.push(`- ${h.date}: ${fmtKm(h.kmDone)} km${emoji}`);
      }
      lines.push("Last 2 weeks (full detail):");
    }
    for (const h of recent) {
      const parts = [`- ${h.date}: ${h.workout} — ${fmtKm(h.kmDone)} km`];
      if (h.plannedKm && h.plannedKm !== h.kmDone) parts.push(`(planned ${fmtKm(h.plannedKm)})`);
      if (h.feeling) parts.push(`· felt "${h.feeling}"`);
      if (h.notes) parts.push(`· note: ${h.notes}`);
      lines.push(parts.join(" "));
    }
  }

  // The full road ahead: every remaining planned session through race day.
  const upcoming = Array.isArray(ctx.upcoming) ? ctx.upcoming : [];
  if (upcoming.length) {
    lines.push("");
    lines.push(`Remaining planned sessions through race day — ${upcoming.length} to go:`);
    for (const u of upcoming) {
      const km = u.km ? ` — ${fmtKm(u.km)} km` : "";
      lines.push(`- ${u.date}: ${u.workout}${km}`);
    }
  }

  if (ctx.week) {
    lines.push("");
    lines.push(`This week so far: ${fmtKm(ctx.week.doneKm)} of ${fmtKm(ctx.week.plannedKm)} km planned.`);
  }
  if (ctx.month) {
    lines.push(`This month so far: ${fmtKm(ctx.month.doneKm)} of ${fmtKm(ctx.month.plannedKm)} km planned.`);
  }

  return lines.join("\n");
}

// Keep only well-formed {role, content} turns to send to the model.
function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    return;
  }

  let ctx;
  try {
    ctx = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (!ctx || typeof ctx !== "object") {
    res.status(400).json({ error: "Missing context" });
    return;
  }

  const messages = sanitizeMessages(ctx.messages);
  if (!messages.length) {
    res.status(400).json({ error: "No messages provided" });
    return;
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" }, // snappy, chat-style replies — no thinking latency
      system: `${SYSTEM_PROMPT}\n\n${buildContextBlock(ctx)}`,
      messages,
    });

    // Plain-text streaming: the client reads the body incrementally and appends
    // each chunk straight into the chat bubble.
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");

    stream.on("text", (delta) => res.write(delta));
    await stream.finalMessage();
    res.end();
  } catch (err) {
    console.error("Coach request failed:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Coach request failed" });
    } else {
      // Already streaming — close the body so the client stops waiting.
      res.end();
    }
  }
}
