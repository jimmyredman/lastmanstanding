/*
 * SiteFit — QLD planning rules engine
 * ------------------------------------
 * Every Queensland planning scheme since 2017 is built on the Queensland
 * Planning Provisions (QPP): a standard set of zones and code structures.
 * So we model ONE engine and load each council as a "pack" of parameters.
 *
 * A pack = council metadata + a map of zones. Each zone carries the numeric
 * controls the yield/compliance engine reads. Adding a new council later is a
 * data-entry job against this same shape — not new code.
 *
 * IMPORTANT — the numbers below are ILLUSTRATIVE DEFAULTS structured on the
 * Townsville City Plan. They must be verified against the current adopted
 * City Plan codes before any output is relied on. Each pack records the
 * version/date it was encoded from so a report can cite it.
 */
(function () {
  "use strict";

  // --- Townsville City Plan (illustrative pack) ------------------------------
  const townsville = {
    id: "townsville",
    name: "Townsville City Council",
    scheme: "Townsville City Plan",
    schemeVersion: "Illustrative v0 — VERIFY against adopted City Plan",
    encodedOn: "2026-07-22",
    freeboard_m: 0.3, // QLD standard freeboard added to Defined Flood Level

    // Standard QPP residential zones. Only the zones needed for the MVP dev
    // types are fully populated; others are stubs ready to complete.
    zones: {
      LDR: {
        code: "LDR",
        name: "Low density residential",
        minLotSize_m2: 450, // standard reconfiguration outcome
        minFrontage_m: 15,
        maxHeight_m: 8.5,
        maxStoreys: 2,
        maxSiteCover_pct: 50,
        setbacks_m: { front: 6, side: 1.5, rear: 3 },
        privateOpenSpace_m2: 30, // per dwelling, min dimension applies
        deepPlanting_pct: 10,
        parkingPerDwelling: 2,
        // Dual occupancy is typically accepted subject to a larger lot.
        dualOcc: {
          permitted: true,
          minLotSize_m2: 600,
          minFrontage_m: 15,
          parkingPerDwelling: 1, // + visitor, see below
          visitorParkingPer2Dwellings: 1,
        },
        multiDwellingPermitted: false, // handled in LMDR/MDR
      },

      LMDR: {
        code: "LMDR",
        name: "Low-medium density residential",
        minLotSize_m2: 400,
        minFrontage_m: 12,
        maxHeight_m: 11.5,
        maxStoreys: 3,
        maxSiteCover_pct: 60,
        setbacks_m: { front: 4, side: 1.5, rear: 3 },
        privateOpenSpace_m2: 24,
        deepPlanting_pct: 15,
        parkingPerDwelling: 1.5,
        dualOcc: {
          permitted: true,
          minLotSize_m2: 450,
          minFrontage_m: 12,
          parkingPerDwelling: 1,
          visitorParkingPer2Dwellings: 1,
        },
        multiDwellingPermitted: true,
        multiDwelling: {
          minLotSize_m2: 600,
          communalOpenSpace_pctOfSite: 10,
          visitorParkingPer5Dwellings: 1,
        },
      },

      RR: {
        code: "RR",
        name: "Rural residential",
        minLotSize_m2: 4000,
        minFrontage_m: 30,
        maxHeight_m: 8.5,
        maxStoreys: 2,
        maxSiteCover_pct: 30,
        setbacks_m: { front: 10, side: 5, rear: 10 },
        privateOpenSpace_m2: 60,
        deepPlanting_pct: 20,
        parkingPerDwelling: 2,
        dualOcc: { permitted: false },
        multiDwellingPermitted: false,
      },
    },
  };

  // Registry. New councils get added here.
  const registry = { townsville };

  window.SiteFit = window.SiteFit || {};
  window.SiteFit.schemes = {
    list() {
      return Object.values(registry).map((p) => ({ id: p.id, name: p.name }));
    },
    get(id) {
      return registry[id] || null;
    },
    zonesFor(id) {
      const p = registry[id];
      if (!p) return [];
      return Object.values(p.zones).map((z) => ({ code: z.code, name: z.name }));
    },
  };
})();
