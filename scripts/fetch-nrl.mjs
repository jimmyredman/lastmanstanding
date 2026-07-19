// Dry-run NRL results ingestion.
// Fetches ESPN's public (unofficial) scoreboard and logs what it returns, so we can confirm
// the data shape + team names BEFORE wiring it to Firestore. No writes, no secrets.
//
// Usage: node scripts/fetch-nrl.mjs [YYYYMMDD]   (optional date, else today's slate)

const CANDIDATES = [
  "https://site.api.espn.com/apis/site/v2/sports/rugby-league/3/scoreboard",
  "https://site.api.espn.com/apis/site/v2/sports/rugby/3/scoreboard",
  "https://site.api.espn.com/apis/site/v2/sports/rugby-league/nrl/scoreboard",
];

async function tryFetch(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (LMS results bot)" } });
    return { url, status: res.status, ok: res.ok, json: res.ok ? await res.json() : null };
  } catch (e) {
    return { url, error: String(e && e.message ? e.message : e) };
  }
}

function summarise(json) {
  const evs = json?.events || [];
  return {
    leagueName: json?.leagues?.[0]?.name,
    leagueSlug: json?.leagues?.[0]?.slug,
    season: json?.season,
    week: json?.week,
    eventCount: evs.length,
    events: evs.map((ev) => {
      const comp = ev.competitions?.[0] || {};
      return {
        date: ev.date,
        name: ev.name,
        state: ev.status?.type?.state,
        completed: !!ev.status?.type?.completed,
        competitors: (comp.competitors || []).map((c) => ({
          team: c.team?.displayName,
          short: c.team?.shortDisplayName,
          abbr: c.team?.abbreviation,
          homeAway: c.homeAway,
          score: c.score,
          winner: c.winner,
        })),
      };
    }),
  };
}

const dates = (process.argv[2] || "").trim();
console.log("NRL dry-run ingestion", dates ? `for dates=${dates}` : "(today's slate)");

let anyOk = false;
for (const base of CANDIDATES) {
  const url = dates ? `${base}?dates=${dates}` : base;
  const r = await tryFetch(url);
  console.log("\n===== " + url + " =====");
  if (r.error) { console.log("ERROR:", r.error); continue; }
  console.log("HTTP", r.status);
  if (r.json) {
    anyOk = true;
    console.log(JSON.stringify(summarise(r.json), null, 2));
  }
}
if (!anyOk) console.log("\nNo candidate endpoint returned data — we'll adjust the URL/params.");
