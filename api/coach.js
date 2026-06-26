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

function buildUserMessage(ctx) {
  const lines = [];
  lines.push(`Race: ${ctx.raceName || "the marathon"} on ${ctx.raceDate || "race day"}.`);
  if (ctx.daysUntilRace != null) {
    lines.push(`Days until race: ${ctx.daysUntilRace}.`);
  }
  if (ctx.phase) lines.push(`Current training phase: ${ctx.phase}.`);

  const d = ctx.day || {};
  lines.push("");
  lines.push("The session I'm asking about:");
  lines.push(`- Date: ${d.label || d.date || "today"}`);
  lines.push(`- Workout: ${d.workout?.trim() || "Rest day"}`);
  if (d.plannedKm) lines.push(`- Planned distance: ${fmtKm(d.plannedKm)} km`);
  if (d.completed) {
    lines.push(`- Status: completed (${fmtKm(d.actualKm)} km run)`);
    if (d.feeling) lines.push(`- How it felt: ${d.feeling}`);
  } else {
    lines.push(`- Status: not done yet`);
  }

  if (Array.isArray(ctx.recent) && ctx.recent.length) {
    lines.push("");
    lines.push("My recent completed sessions (most recent first):");
    for (const r of ctx.recent) {
      const feeling = r.feeling ? `, felt "${r.feeling}"` : "";
      lines.push(`- ${r.date}: ${r.workout} — ${fmtKm(r.km)} km${feeling}`);
    }
  }

  if (ctx.week) {
    lines.push("");
    lines.push(`This week so far: ${fmtKm(ctx.week.doneKm)} of ${fmtKm(ctx.week.plannedKm)} km planned.`);
  }
  if (ctx.month) {
    lines.push(`This month so far: ${fmtKm(ctx.month.doneKm)} of ${fmtKm(ctx.month.plannedKm)} km planned.`);
  }

  lines.push("");
  lines.push("Talk me through this session.");
  return lines.join("\n");
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

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" }, // snappy, chat-style replies — no thinking latency
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(ctx) }],
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
