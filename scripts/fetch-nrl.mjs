// NRL results ingestion — writes a static nrl-results.json the app reads to pre-fill
// the host results panel. Free, no secrets: the workflow commits this file back to the
// repo and Vercel serves it at /nrl-results.json.
//
// Source: ESPN's public (unofficial) scoreboard feed.
// Usage: node scripts/fetch-nrl.mjs [YYYYMMDD | YYYYMMDD-YYYYMMDD]
//   (optional date/range; default = current week's slate)

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ENDPOINT = "https://site.api.espn.com/apis/site/v2/sports/rugby-league/3/scoreboard";
const OUT_FILE = new URL("../nrl-results.json", import.meta.url);

// ESPN team names → the short names this app uses. Anything not listed passes through
// unchanged (Panthers, Broncos, Storm, etc. already match).
const TEAM_MAP = {
  "Wests Tigers": "Tigers",
  "Sea Eagles": "Manly",
  "Manly Sea Eagles": "Manly",
  "Parramatta Eels": "Eels",
};
const KNOWN = new Set([
  "Storm", "Broncos", "Knights", "Sharks", "Eels", "Bulldogs", "Panthers", "Warriors",
  "Roosters", "Cowboys", "Tigers", "Manly", "Raiders", "Rabbitohs", "Titans", "Dragons", "Dolphins",
]);
function normTeam(c) {
  const candidates = [c.team?.shortDisplayName, c.team?.displayName, c.team?.name];
  for (const raw of candidates) {
    if (!raw) continue;
    if (TEAM_MAP[raw]) return TEAM_MAP[raw];
    if (KNOWN.has(raw)) return raw;
    // last word (e.g. "North Queensland Cowboys" → "Cowboys")
    const last = String(raw).split(" ").pop();
    if (KNOWN.has(last)) return last;
  }
  return c.team?.shortDisplayName || c.team?.displayName || "?";
}

async function fetchScoreboard(dates) {
  const url = dates ? `${ENDPOINT}?dates=${dates}` : ENDPOINT;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (LMS results bot)" } });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

function buildRound(json) {
  const week = json?.week?.number;
  const year = json?.season?.year;
  if (!week) return null;
  const games = (json.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const cs = comp.competitors || [];
    const home = cs.find((c) => c.homeAway === "home") || cs[0];
    const away = cs.find((c) => c.homeAway === "away") || cs[1];
    if (!home || !away) return null;
    const winner = home.winner ? normTeam(home) : away.winner ? normTeam(away) : null;
    return {
      home: normTeam(home),
      away: normTeam(away),
      homeScore: home.score != null ? Number(home.score) : null,
      awayScore: away.score != null ? Number(away.score) : null,
      winner,
      completed: !!ev.status?.type?.completed,
      // Schedule info so the app can load real fixtures/times each week (esp. finals).
      date: ev.date || null,
      venue: comp.venue?.fullName || null,
    };
  }).filter(Boolean);
  return { roundId: `r${week}`, week, year, games };
}

const arg = (process.argv[2] || "").trim();
console.log("NRL ingestion", arg ? `for dates=${arg}` : "(current week)");

const json = await fetchScoreboard(arg);
const round = buildRound(json);
if (!round) { console.log("No week/round in feed — nothing to write."); process.exit(0); }

// Merge into the existing file so earlier rounds are preserved across the season.
let store = { updatedAt: null, rounds: {} };
if (existsSync(OUT_FILE)) {
  try { store = JSON.parse(readFileSync(OUT_FILE, "utf8")); store.rounds = store.rounds || {}; }
  catch { store = { updatedAt: null, rounds: {} }; }
}
store.rounds[round.roundId] = { week: round.week, year: round.year, games: round.games };
// ISO stamp without Date.now(): use the newest game date if present, else leave prior stamp.
store.updatedAt = json?.events?.[0]?.date || store.updatedAt;

writeFileSync(OUT_FILE, JSON.stringify(store, null, 2) + "\n");
const done = round.games.filter((g) => g.completed).length;
console.log(`Wrote ${round.roundId}: ${round.games.length} games (${done} completed).`);
console.log(round.games.map((g) => `  ${g.home} ${g.homeScore ?? "-"} - ${g.awayScore ?? "-"} ${g.away}${g.winner ? `  → ${g.winner}` : ""}`).join("\n"));
