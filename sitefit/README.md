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
- **Auto-fetch** of a site's facts from live QLD web services (see below).

## Live data — "pull it automatically for any council"

`api/lookup` pulls a site's facts from real, web-accessible QLD services and
returns one normalized model that prefills the form. Enter a **Lot/Plan**
(e.g. `3RP12345`) or **coordinates**, press *Pull site data*.

Two tiers of coverage:

| Data | Source | Coverage |
|---|---|---|
| Lot boundary + area | QLD DCDB cadastre (`spatial-gis.information.qld.gov.au`) | **Every** QLD address |
| Screening flood | QLD Floodplain Assessment Overlay (`services8.arcgis.com/g9mpp…`) | **Every** QLD address (screening only) |
| Council identity | QLD LGA boundaries | **Every** QLD address |
| Zoning + authoritative flood | Each council's ArcGIS service | Councils with a queryable service |
| Address → Lot/Plan | QLD Geocoder / PLSplus (`geocode.information.qld.gov.au`) | Statewide, **needs a free key** |

Honest limits:
- **Zoning/council-flood** is automatic only for councils that expose a
  queryable ArcGIS service (Townsville is wired; the rest are registry stubs in
  `engine/councils.js`). Councils with only an interactive "PD Online" viewer
  fall back to statewide data + manual zone entry.
- The statewide flood layer is **screening** ("not intended to predict flooding
  for specific parcels"); the app prefers a council's authoritative flood
  overlay where available and labels which one it used.
- Auto-fetch supplies the **zone and overlays**; the **numeric controls** behind
  a zone still come from the encoded rules pack (`engine/schemes.js`).
- Calls run **server-side** (council servers block direct browser calls / CORS).

## Run it

**Static only (no live data):** open `index.html`, or `python3 -m http.server`.

**Full app incl. live QLD data pulls** (needs outbound network):

```bash
cd sitefit && node server.mjs      # http://localhost:8080
```

Tests (no network needed):

```bash
node test/geo.test.mjs      # geometry maths
node test/lookup.test.mjs   # lookup orchestration (mocked services)
```

Deploy: static files + `api/lookup.mjs` as a Vercel Node serverless function.

## Structure

```
sitefit/
  index.html          UI, auto-fetch, compliance report (vanilla JS)
  server.mjs          local dev server (static + /api/lookup)
  api/
    lookup.mjs        server-side site lookup against QLD services
  engine/
    schemes.js        QPP rules engine + council packs (Townsville)
    flood.js          Flood / storm-tide intelligence
    yield.js          Subdivision + duplex yield and compliance
    concept.js        Indicative to-scale SVG layout generator
    geo.js            Parcel geometry: area, frontage, flood-overlap %
    councils.js       Data-source registry (endpoints per council)
  test/               unit + orchestration tests
```

The engine is plain, framework-free JS, so it carries straight over to the
production stack unchanged.

## Roadmap (from the blueprint)

- **Phase 2** — townhouses + low-rise units; CAD/GIS + AI PDF intake; Livable
  Housing ratios; 3–4 more councils; live QLD cadastre/overlay lookup by address.
- **Phase 3** — all ~14 councils; NatHERS/QDC simulation; feasibility ($, Ex GST);
  migrate to Next.js + PostGIS with staff logins.

## Adding a council

Two parts, both data entry (not code) thanks to the shared QPP structure:

1. **Rules pack** — add a zone set to `engine/schemes.js` following the
   Townsville shape (lot size, frontage, height, cover, setbacks, POS, parking,
   dual-occ rules), verified against that council's adopted scheme.
2. **Data source** — in `engine/councils.js`, fill the council's `planning.url`
   with its ArcGIS MapServer and set `apiAvailable: true`. Layers are matched by
   name regex at runtime, so exact layer IDs don't need hard-coding.

## Verified vs. deploy-only

The geometry maths and the lookup orchestration are unit-tested (`test/`). The
live network calls are coded against the real, current endpoints but are
validated on deploy / a network-enabled run — the build environment used to
author this had outbound network restricted.
