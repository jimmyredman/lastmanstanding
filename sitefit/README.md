# SiteFit — Development Feasibility & Concept Design (MVP)

Internal RJG Builders tool. Turns a Queensland site into an **indicative,
planning-aware** yield and concept site layout for pre-lodgement discussions.

> **Decision support only — not an approval.** Every output is indicative and
> must be verified against the adopted planning scheme and signed off by a
> registered town planner / RPEQ before it is relied on. The planning numbers
> in this MVP are **illustrative** placeholders structured on the Townsville
> City Plan; they must be checked against the current adopted scheme.

## What this MVP does

- Council: **Townsville** (illustrative pack). Zones: LDR, LMDR, RR.
- Development types: **Land subdivision (ROL)** and **Dual occupancy (duplex)**.
- **Flood intelligence** as a first-class constraint:
  - hazard category (none / low / medium / high / floodway),
  - Defined Flood Level + QLD freeboard → minimum habitable floor level,
  - fill/raise requirement vs natural ground,
  - developable-area reduction, and floodway/high-hazard **knock-out**,
  - storm-tide inundation flag for coastal sites.
- Core planning-control checks (lot size, frontage, site cover, height,
  setbacks, POS, parking) with the rule cited on each.
- An indicative, to-scale **concept layout** (SVG) and a printable report.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
cd sitefit && python3 -m http.server 8080   # then visit http://localhost:8080
```

Deploys as static hosting (Vercel / Firebase) alongside the existing app.

## Structure

```
sitefit/
  index.html          UI + compliance report (vanilla JS, self-contained CSS)
  engine/
    schemes.js        QPP rules engine + council packs (Townsville)
    flood.js          Flood / storm-tide intelligence
    yield.js          Subdivision + duplex yield and compliance
    concept.js        Indicative to-scale SVG layout generator
```

The engine is plain, framework-free JS attached to `window.SiteFit`, so it
carries straight over to the production stack unchanged.

## Roadmap (from the blueprint)

- **Phase 2** — townhouses + low-rise units; CAD/GIS + AI PDF intake; Livable
  Housing ratios; 3–4 more councils; live QLD cadastre/overlay lookup by address.
- **Phase 3** — all ~14 councils; NatHERS/QDC simulation; feasibility ($, Ex GST);
  migrate to Next.js + PostGIS with staff logins.

## Adding a council

Add a pack to `engine/schemes.js` following the Townsville shape (zones with
lot size, frontage, height, cover, setbacks, POS, parking, dual-occ rules).
Because all QLD schemes share the QPP structure, this is data entry, not code.
