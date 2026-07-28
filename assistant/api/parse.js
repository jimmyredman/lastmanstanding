// POST /api/parse
// Turns a raw dictated brain-dump into structured, reviewable items.
//
// Body:  { text: string, jobs?: string[], now?: ISOString }
// Reply: { source: "claude" | "heuristic", items: Item[] }
//
// Item = {
//   type: "task" | "event" | "note" | "idea",
//   title: string,          // short, action-first
//   detail: string,         // any leftover context
//   dueDate: string | null, // "YYYY-MM-DD" or full ISO if a time was said
//   jobName: string | null, // matched against `jobs` when possible
//   keywords: string[],
//   priority: "low" | "normal" | "high"
// }
//
// If ANTHROPIC_API_KEY is set it uses Claude for smart splitting/categorising.
// If not (or Claude errors) it falls back to a local heuristic parser so the
// app keeps working with zero configuration.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const body = await readBody(req);
  const text = (body.text || "").toString().trim();
  const jobs = Array.isArray(body.jobs) ? body.jobs.filter(Boolean) : [];
  const now = body.now ? new Date(body.now) : new Date();
  if (!text) {
    res.status(400).json({ error: "No text provided" });
    return;
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const items = await parseWithClaude(text, jobs, now);
      res.status(200).json({ source: "claude", items });
      return;
    } catch (e) {
      // Fall through to heuristic — never leave the user stuck.
      console.error("Claude parse failed, using heuristic:", e && e.message);
    }
  }
  res.status(200).json({ source: "heuristic", items: heuristicParse(text, jobs, now) });
};

// ---------------------------------------------------------------- Claude ----

async function parseWithClaude(text, jobs, now) {
  const tool = {
    name: "emit_items",
    description: "Return the structured items extracted from the user's dictation.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["task", "event", "note", "idea"] },
              title: { type: "string" },
              detail: { type: "string" },
              dueDate: { type: ["string", "null"], description: "YYYY-MM-DD, or full ISO 8601 if a specific time was mentioned. null if none." },
              jobName: { type: ["string", "null"], description: "The related job/project. Prefer an exact match from the provided job list." },
              keywords: { type: "array", items: { type: "string" } },
              priority: { type: "string", enum: ["low", "normal", "high"] },
            },
            required: ["type", "title", "detail", "dueDate", "jobName", "keywords", "priority"],
          },
        },
      },
      required: ["items"],
    },
  };

  const sys =
    "You are the sorting brain for a tradie/builder's voice-capture organiser. " +
    "The user dictates a stream of thoughts. Split it into separate, atomic items. " +
    "Classify each: task (something to do), event (something happening at a time/place), " +
    "note (info to keep), or idea (a maybe/thought). Write a short action-first title and put " +
    "any extra context in detail. Resolve relative dates (today, tomorrow, next Tuesday, Friday arvo) " +
    "against the current date given, outputting YYYY-MM-DD (add a time only if one was clearly said). " +
    "If a job/project is mentioned, set jobName — prefer an exact string from the provided job list. " +
    "Add a few lowercase keywords (trades, materials, people, places). Australian English, ex-GST context. " +
    "Never invent items that weren't said. Call the emit_items tool exactly once.";

  const usr =
    `Current date: ${now.toISOString().slice(0, 10)} (${now.toString()}).\n` +
    (jobs.length ? `Known jobs/projects: ${jobs.join(", ")}.\n` : "") +
    `\nDictation:\n"""${text}"""`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: sys,
      tools: [tool],
      tool_choice: { type: "tool", name: "emit_items" },
      messages: [{ role: "user", content: usr }],
    }),
  });
  if (!r.ok) throw new Error("Anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  const data = await r.json();
  const block = (data.content || []).find((c) => c.type === "tool_use");
  if (!block || !block.input || !Array.isArray(block.input.items)) throw new Error("No tool output");
  return block.input.items.map(normaliseItem);
}

function normaliseItem(it) {
  const types = ["task", "event", "note", "idea"];
  const prios = ["low", "normal", "high"];
  return {
    type: types.includes(it.type) ? it.type : "note",
    title: (it.title || "").toString().slice(0, 200) || "Untitled",
    detail: (it.detail || "").toString(),
    dueDate: it.dueDate || null,
    jobName: it.jobName || null,
    keywords: Array.isArray(it.keywords) ? it.keywords.map((k) => String(k).toLowerCase()).slice(0, 8) : [],
    priority: prios.includes(it.priority) ? it.priority : "normal",
  };
}

// ------------------------------------------------------------- Heuristic ----
// A dependency-free fallback. Good enough to be useful; Claude is much better.

function heuristicParse(text, jobs, now) {
  // Split on sentence enders and the words people naturally string thoughts with.
  const chunks = text
    .replace(/\n+/g, ". ")
    .split(/(?:\.|;|,? (?:and then|then|also|next|after that)\b|,? and\b(?=\s+(?:i|we|need|remember|call|order|send|book|chase)))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  return (chunks.length ? chunks : [text]).map((chunk) => {
    const lc = chunk.toLowerCase();
    const type = /\b(meeting|meet|site visit|inspection|handover|induction|appointment|walkthrough|call at|at \d)\b/.test(lc)
      ? "event"
      : /\b(call|ring|email|order|send|chase|book|pay|invoice|quote|follow up|pick up|drop off|remember to|need to|get)\b/.test(lc)
      ? "task"
      : /\b(idea|maybe|might|could|thinking|what if|consider)\b/.test(lc)
      ? "idea"
      : "note";

    const jobName = jobs.find((j) => lc.includes(j.toLowerCase())) || null;
    const dueDate = extractDate(lc, now);
    const priority = /\b(urgent|asap|today|now|critical|important)\b/.test(lc) ? "high" : "normal";

    // Keywords: known trade/material words + any Job words present.
    const vocab = ["concrete", "slab", "steel", "timber", "plumber", "electrician", "sparky", "chippy",
      "council", "certifier", "surveyor", "crane", "excavator", "render", "gyprock", "tiles", "roof",
      "footings", "scaffold", "delivery", "quote", "invoice", "variation", "rfi", "defect", "handover"];
    const keywords = [...new Set(vocab.filter((w) => lc.includes(w)))].slice(0, 6);

    let title = chunk.replace(/^(remember to|need to|i need to|we need to|make sure to|don'?t forget to)\s+/i, "");
    title = title.charAt(0).toUpperCase() + title.slice(1);
    return { type, title: title.slice(0, 200), detail: "", dueDate, jobName, keywords, priority };
  });
}

function extractDate(lc, now) {
  const iso = (d) => d.toISOString().slice(0, 10);
  const d = new Date(now);
  if (/\btoday\b/.test(lc)) return iso(d);
  if (/\btomorrow\b|\btomoz\b|\btmrw\b/.test(lc)) { d.setDate(d.getDate() + 1); return iso(d); }
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < 7; i++) {
    const re = new RegExp("\\b(?:next |this )?" + days[i].slice(0, 3) + "[a-z]*\\b");
    if (re.test(lc)) {
      const delta = ((i - d.getDay() + 7) % 7) || 7; // next occurrence
      d.setDate(d.getDate() + delta);
      return iso(d);
    }
  }
  const m = lc.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/); // dd/mm[/yy]
  if (m) {
    const day = +m[1], mon = +m[2] - 1;
    let yr = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    const dt = new Date(yr, mon, day);
    if (!m[3] && dt < now) dt.setFullYear(yr + 1);
    if (!isNaN(dt)) return iso(dt);
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}
