# Rounds & finals — how the schedule stays current

## Regular season (Rounds 19–27)
Fixtures, kickoff times and byes are built into the app (`NRL_ROUNDS` in `index.html`). The
current round is detected automatically from today's date, so the create-competition form always
defaults to the next round still open for entries — no weekly action needed.

## Finals (after Round 27)
Finals matchups, venues and times aren't known until the previous week's results, so the four
finals rounds ship as **placeholders with no fixtures**:

- `r28` — Finals Week 1
- `r29` — Semi Finals
- `r30` — Preliminary Finals
- `r31` — Grand Final

Competitions still **advance into finals automatically** (the elimination engine moves survivors
to the next round in order). Each finals week, the host sets that round's real games:

1. Open the competition's **Enter round results → Fixtures**.
2. Tap **Load fixtures from NRL** — pulls that week's actual matchups, times and venues from the
   auto-updated feed (`nrl-results.json`, refreshed by the GitHub Action). If the feed's round key
   differs, it matches by kickoff date, so it still finds the right week.
3. Review and **Save**. Players then pick from the real finals matchups; results/auto-fill and the
   margin decider work as normal.

If the feed doesn't have the fixtures yet, the host can **Set fixtures → Add a fixture** and enter
them manually — the guaranteed fallback.

## Weekly upkeep
The GitHub Action (`.github/workflows/nrl-results.yml`) already runs daily and writes both results
and fixtures (teams, scores, kickoff date, venue) into `nrl-results.json`. That's the weekly data
refresh — no manual step during the regular season. During finals, the only host action is the
one-tap **Load fixtures from NRL** each week.

## Next season
When the 2027 draw is published, add the new rounds to `NRL_ROUNDS` (or extend the feed to supply
them). The date-based round detection and finals flow then keep working unchanged.
