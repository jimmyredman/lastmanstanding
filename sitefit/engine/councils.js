/*
 * SiteFit — Data-source registry
 * ------------------------------
 * The real, web-accessible QLD services SiteFit pulls from, plus per-council
 * planning-scheme endpoints. Two tiers:
 *
 *   STATEWIDE  — one service for every address in Queensland: cadastre
 *                (lot boundary/area), the QLD Floodplain Assessment Overlay
 *                (screening flood), and LGA boundaries (to identify the council).
 *
 *   COUNCILS   — each council publishes its OWN planning-scheme map service
 *                (zones + its authoritative flood overlay). Most larger councils
 *                expose a queryable ArcGIS service; smaller shires only have an
 *                interactive "PD Online" viewer with no API — those degrade to
 *                statewide data + manual entry (marked apiAvailable:false).
 *
 * Layers are resolved by NAME REGEX at runtime (the handler reads the service's
 * layer list and matches), so we don't hard-code layer IDs that drift between
 * council scheme versions.
 *
 * URLs are the current published endpoints (confirmed 2026-07). They are hit
 * server-side by api/lookup — a browser can't call them directly (CORS).
 */
(function (root) {
  "use strict";

  const STATEWIDE = {
    // DCDB cadastral parcels — query by LOTPLAN or by point.
    cadastre: {
      url: "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/LandParcelPropertyFramework/MapServer/4",
      lotplanField: "lotplan",   // e.g. "3RP12345"
      areaField: "lot_area",     // m2 (verify against live schema; falls back to computed area)
    },
    // Queensland Floodplain Assessment Overlay — statewide SCREENING flood.
    // Published as layer 15 of the QLD Government AdminBoundariesFramework
    // MapServer (confirmed live 2026-07). The previously used ArcGIS Online
    // FeatureServer mirror is no longer reachable, so we hit the authoritative
    // QLD Government service directly. Polygon queries return the overlay extent
    // intersecting the parcel; engine/geo.js computes the affected %.
    floodScreening: {
      url: "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Boundaries/AdminBoundariesFramework/MapServer/15",
      label: "QLD Floodplain Assessment Overlay (screening)",
      authoritative: false,
    },
    // Local government area boundaries — used to identify which council a point
    // falls in, then look the council up in COUNCILS below. Layer 11 carries
    // the LGA name in `adminareaname` (e.g. "TOWNSVILLE CITY"); note the layer
    // also has an `admintypename` field ("LOCAL GOVERNMENT") that a loose /name/
    // match would grab first, so the name regex is scoped to the real field.
    lgaBoundaries: {
      url: "https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Boundaries/AdminBoundariesFramework/MapServer",
      lgaLayerNameRegex: /local government area|lga/i,
      lgaNameField: /adminareaname|^lga$/i,
    },
    // Address -> lot/plan + coordinates. Free QLD service but requires a key.
    geocoder: {
      url: "https://geocode.information.qld.gov.au/",
      note: "Queensland Geocoder / PLSplus-Public. Free but requires registration for a key. Address input uses this; lot/plan and map-point inputs do not.",
      requiresKey: true,
    },
  };

  // Map a council's zone NAME to our rules-pack zone key. QPP standard names
  // make this consistent across councils.
  const QPP_ZONE_MAP = [
    { re: /low[- ]medium density/i, key: "LMDR" },
    { re: /medium density/i, key: "LMDR" },
    { re: /low density/i, key: "LDR" },
    { re: /rural residential/i, key: "RR" },
    { re: /(^|\b)residential/i, key: "LDR" }, // generic fallback
  ];

  function zoneNameToPackKey(name) {
    if (!name) return null;
    for (const m of QPP_ZONE_MAP) if (m.re.test(name)) return m.key;
    return null;
  }

  // Council planning-scheme services. `packId` links to engine/schemes.js.
  const COUNCILS = {
    "townsville city council": {
      packId: "townsville",
      // The council's City Plan ArcGIS (EXT_CityPlanningScheme_Current) and its
      // FloodInfoPortal both require an ArcGIS token — they return HTTP 499
      // "Token Required" to anonymous callers (confirmed 2026-07). The only
      // public Townsville service (PUB_Core) carries cadastre/roads/suburbs, not
      // zoning or the flood overlay. So auto-zoning is NOT available for
      // Townsville today: we resolve the council + rules pack, screen flood from
      // the statewide overlay, and the zone is entered manually. Set
      // apiAvailable:true and supply a token-bearing/public planning.url to
      // switch live zoning + authoritative council flood back on.
      apiAvailable: false,
      requiresToken: true,
      planning: {
        url: "https://maps.townsville.qld.gov.au/arcgis/rest/services/Geocortex/EXT_CityPlanningScheme_Current/MapServer",
        zoneLayerNameRegex: /zone|zoning/i,
        zoneNameField: /zone|desc|name/i,
        floodLayerNameRegex: /flood/i,      // council's authoritative flood overlay
        floodHazardField: /hazard|category|class|level/i,
      },
    },

    // --- Stubs for the rest of RJG's footprint. Fill `planning.url` with each
    //     council's ArcGIS MapServer to switch them on; leave apiAvailable
    //     false until confirmed, so they safely fall back to statewide+manual. ---
    "cairns regional council": { packId: null, apiAvailable: false, planning: null },
    "mackay regional council": { packId: null, apiAvailable: false, planning: null },
    "whitsunday regional council": { packId: null, apiAvailable: false, planning: null },
    "burdekin shire council": { packId: null, apiAvailable: false, planning: null },
    "hinchinbrook shire council": { packId: null, apiAvailable: false, planning: null },
    "cassowary coast regional council": { packId: null, apiAvailable: false, planning: null },
    "douglas shire council": { packId: null, apiAvailable: false, planning: null },
    "isaac regional council": { packId: null, apiAvailable: false, planning: null },
    "charters towers regional council": { packId: null, apiAvailable: false, planning: null },
    "flinders shire council": { packId: null, apiAvailable: false, planning: null },
    "richmond shire council": { packId: null, apiAvailable: false, planning: null },
    "mount isa city council": { packId: null, apiAvailable: false, planning: null },
    "brisbane city council": { packId: null, apiAvailable: false, planning: null },
  };

  function findCouncil(lgaName) {
    if (!lgaName) return null;
    const key = String(lgaName).trim().toLowerCase();
    if (COUNCILS[key]) return { key, ...COUNCILS[key] };
    // loose match on the distinctive word (e.g. "Townsville")
    for (const k of Object.keys(COUNCILS)) {
      const word = k.split(" ")[0];
      if (key.includes(word)) return { key: k, ...COUNCILS[k] };
    }
    return null;
  }

  const api = { STATEWIDE, COUNCILS, findCouncil, zoneNameToPackKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SiteFit = root.SiteFit || {};
  root.SiteFit.councils = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
