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
 * VERIFICATION STATUS (updated 2026-07-22):
 *  - Reconfiguration (subdivision) DIMENSIONS — minimum lot size, frontage and
 *    depth — are now VERIFIED against the adopted Townsville City Plan
 *    Reconfiguring a lot code, Table 9.4.4.3(c) (see `sources.reconfiguringLotCode`).
 *  - Building HEIGHT is verified against the relevant zone code.
 *  - Flood freeboard is verified against the Flood hazard overlay code.
 *  - Controls the City Plan does NOT set numerically for a dwelling house
 *    (site cover, setbacks, private open space, deep planting, car parking)
 *    are governed by the Queensland Development Code (QDC MP1.1/1.2) and the
 *    Transport, access and parking code. Those values are flagged INDICATIVE /
 *    QDC below and must still be checked by a registered planner / RPEQ.
 *  Every output remains decision-support only, not an approval.
 */
(function () {
  "use strict";

  // --- Townsville City Plan --------------------------------------------------
  const townsville = {
    id: "townsville",
    name: "Townsville City Council",
    scheme: "Townsville City Plan",
    schemeVersion: "Zone & Reconfiguring-a-lot codes v2015/01; Flood hazard overlay code v2017/02",
    encodedOn: "2026-07-22",
    // Reconfiguration dimensions + heights verified from the adopted codes; the
    // QDC-governed built-form controls are still indicative (see per-field notes).
    verified: true,
    freeboard_m: 0.3, // CONFIRMED: Flood hazard overlay code 8.2.6 AO1.2(a)/AO4.1 —
                      // habitable floor level ≥300mm above the Defined Flood Level
                      // (Defined Flood Event = 1% AEP).
    // Authoritative sources the zone controls below are verified against:
    sources: {
      ldrZoneCode: "https://tccplanningscheme.z8.web.core.windows.net/2015_01/6.2.1%20Low%20density%20residential%20zone%20code.pdf",
      ruralResidentialZoneCode: "https://tccplanningscheme.z8.web.core.windows.net/2015_01/6.2.4%20Rural%20residential%20zone%20code.pdf",
      reconfiguringLotCode: "https://tccplanningscheme.z8.web.core.windows.net/2015_01/9.4.4%20Reconfiguring%20a%20lot%20code.pdf", // Table 9.4.4.3(c) = minimum lot dimensions
      floodOverlayCode: "https://tccplanningscheme.z8.web.core.windows.net/2017_02/8.2.6%20Flood%20hazard%20overlay%20code.pdf",
      floodPolicy: "https://tccplanningscheme.z8.web.core.windows.net/current/SC6.7%20Flood%20hazard%20planning%20scheme%20policy.pdf",
    },

    zones: {
      LDR: {
        code: "LDR",
        name: "Low density residential",
        verified: true, // lot dimensions + height verified from the adopted codes
        // Reconfiguration — Reconfiguring a lot code, Table 9.4.4.3(c):
        minLotSize_m2: 400,   // "400m² otherwise" (was 450). Precinct variations:
                              // 1,000m² in the Stables precinct; Marlow St precinct
                              // min 750m² with a 1,700m² average lot (LDR code AO34).
        minFrontage_m: 8,     // min frontage other than a rear lot (was 15)
        minDepth_m: 25,       // min depth
        // Building form:
        maxHeight_m: 8.5,     // house-compatible; LDR zone code AO19.2(a) "8.5m or 2 storeys"
        maxStoreys: 2,
        maxSiteCover_pct: 50, // INDICATIVE/QDC — dwelling-house site cover is set by the
                              // QDC (MP1.1/1.2). The LDR zone code only caps non-residential
                              // at 60% (AO19.2c) and multiple dwellings at 65% (AO21a).
        setbacks_m: { front: 6, side: 1.5, rear: 3 }, // INDICATIVE/QDC — dwelling-house siting is
                              // set by QDC MP1.1/1.2. The LDR zone code sets setbacks only for
                              // multiple dwellings: rear 6m, side 1.5/2/2.5m by wall height (AO22).
        privateOpenSpace_m2: 30, // INDICATIVE/QDC — for multiple dwellings the LDR code requires
                              // 35m² ground-floor POS (min 3m) or a 9–16m² balcony (AO28).
        deepPlanting_pct: 10, // INDICATIVE — not a numeric control in the LDR zone code
        parkingPerDwelling: 2, // Transport, access and parking code (not the zone code)
        dualOcc: {
          permitted: true,    // LDR zone code purpose expressly accommodates dual occupancy dwellings
          minLotSize_m2: 600, // INDICATIVE — no dual-occupancy minimum lot is fixed in the zone or
                              // RoL codes; the 400m² RoL minimum applies to the resulting lots. Verify.
          minFrontage_m: 15,  // INDICATIVE
          parkingPerDwelling: 1,
          visitorParkingPer2Dwellings: 1,
        },
        // Low-rise multiple dwellings are assessable in LDR in defined, walkable
        // locations (LDR code PO20) but are excluded from indicative yield here.
        multiDwellingPermitted: false,
      },

      // NOTE: Townsville City Plan has NO "Low-medium density residential" zone —
      // its equivalent is the "Medium density residential" (MDR) zone. The lot
      // dimensions below are the verified MDR row of RoL Table 9.4.4.3(c); the
      // built-form controls are INDICATIVE pending the MDR zone code (6.2.2).
      LMDR: {
        code: "LMDR",
        name: "Low-medium / Medium density residential",
        verified: false,
        minLotSize_m2: 400,   // MDR row, RoL Table 9.4.4.3(c)
        minFrontage_m: 8,     // MDR row (was 12)
        minDepth_m: 25,       // MDR row
        maxHeight_m: 11.5,    // INDICATIVE — verify against MDR zone code 6.2.2
        maxStoreys: 3,        // INDICATIVE
        maxSiteCover_pct: 60, // INDICATIVE
        setbacks_m: { front: 4, side: 1.5, rear: 3 }, // INDICATIVE
        privateOpenSpace_m2: 24, // INDICATIVE
        deepPlanting_pct: 15, // INDICATIVE
        parkingPerDwelling: 1.5, // Transport, access and parking code
        dualOcc: {
          permitted: true,
          minLotSize_m2: 450, // INDICATIVE
          minFrontage_m: 12,  // INDICATIVE
          parkingPerDwelling: 1,
          visitorParkingPer2Dwellings: 1,
        },
        multiDwellingPermitted: true,
        multiDwelling: {
          minLotSize_m2: 600, // INDICATIVE
          communalOpenSpace_pctOfSite: 10,
          visitorParkingPer5Dwellings: 1,
        },
      },

      RR: {
        code: "RR",
        name: "Rural residential",
        verified: true, // lot dimensions + height verified from the adopted codes
        // Reconfiguration — Reconfiguring a lot code, Table 9.4.4.3(c):
        minLotSize_m2: 4000,        // "4,000m² otherwise"
        minLotSizeCatchment_m2: 40000, // 4ha where the water resource catchment overlay applies
        minFrontage_m: 40,          // was 30
        minDepth_m: 50,
        // Building form:
        maxHeight_m: 8.5,     // RR zone code AO5.2 (non-residential ≤2 storeys/8.5m); dwelling house 8.5m via QDC
        maxStoreys: 2,
        maxSiteCover_pct: 30, // INDICATIVE — the RR zone code sets no numeric site cover; dwelling-house cover via QDC
        setbacks_m: { front: 10, side: 5, rear: 10 }, // INDICATIVE — rural setbacks not fixed numerically in the RR zone code
        privateOpenSpace_m2: 60, // INDICATIVE — large-lot rural residential
        deepPlanting_pct: 20, // INDICATIVE
        parkingPerDwelling: 2, // Transport, access and parking code
        // RR zone code 6.2.4(3)(a): dwelling houses only, "to the general
        // exclusion of other more intensive residential uses".
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
