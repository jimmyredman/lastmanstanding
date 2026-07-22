/*
 * SiteFit — Flood intelligence
 * ----------------------------
 * In North & Central QLD, flood is the number-one thing that reshapes or kills
 * a site — often before zoning even matters. This module turns the flood facts
 * about a site into planning consequences:
 *
 *   1. Minimum habitable floor level (MHFL) = Defined Flood Level + freeboard.
 *   2. How much the ground must be raised/filled to reach that level.
 *   3. How much of the site is removed from the developable area.
 *   4. Whether the hazard is an outright KNOCK-OUT (floodway / high hazard).
 *
 * Hazard categories follow the QLD flood-hazard framework (derived from depth
 * x velocity). Storm-tide inundation is flagged separately for coastal sites.
 */
(function () {
  "use strict";

  // How each hazard category behaves. `exclusion` = fraction of the affected
  // area that comes out of the developable area. `knockout` stops new lots or
  // dwellings being created on the affected land.
  const HAZARD = {
    none: { label: "No mapped flood", exclusion: 0, knockout: false, rank: 0 },
    low: {
      label: "Low hazard",
      exclusion: 0.1,
      knockout: false,
      rank: 1,
      note: "Manageable with floor-level and minor filling controls.",
    },
    medium: {
      label: "Medium hazard",
      exclusion: 0.5,
      knockout: false,
      rank: 2,
      note: "Usable area materially reduced; expect fill, drainage and floor-level conditions.",
    },
    high: {
      label: "High hazard",
      exclusion: 1.0,
      knockout: true,
      rank: 3,
      note: "New lots/dwellings not supported on high-hazard land. Yield limited to unaffected area.",
    },
    floodway: {
      label: "Floodway",
      exclusion: 1.0,
      knockout: true,
      rank: 4,
      note: "Floodway must be kept clear of development and fill. No yield on affected land.",
    },
  };

  /*
   * assess(input, pack)
   *  input.hazard       one of HAZARD keys
   *  input.affectedPct  % of the site the hazard covers (0-100)
   *  input.dfl_m        Defined Flood Level (m AHD), optional
   *  input.ground_m     representative site ground level (m AHD), optional
   *  input.stormTide    boolean — coastal storm-tide inundation mapped
   *  pack               council pack (for freeboard)
   */
  function assess(input, pack) {
    const hazard = HAZARD[input.hazard] || HAZARD.none;
    const affectedPct = clamp(Number(input.affectedPct) || 0, 0, 100);
    const freeboard = pack && pack.freeboard_m != null ? pack.freeboard_m : 0.3;

    // Fraction of the whole site removed from the developable area.
    const developableExclusion = (hazard.exclusion * affectedPct) / 100;

    // Floor level maths (only when levels supplied).
    let mhfl_m = null; // minimum habitable floor level, m AHD
    let fillOrRaise_m = null; // how far above natural ground the floor sits
    if (isNum(input.dfl_m)) {
      mhfl_m = round2(input.dfl_m + freeboard);
      if (isNum(input.ground_m)) {
        fillOrRaise_m = round2(mhfl_m - input.ground_m);
      }
    }

    const findings = [];

    if (hazard.rank === 0 && !input.stormTide) {
      findings.push({
        level: "pass",
        text: "No flood or storm-tide overlay mapped over the site.",
      });
    }

    if (hazard.knockout && affectedPct > 0) {
      findings.push({
        level: "fail",
        text:
          hazard.label +
          " over ~" +
          affectedPct +
          "% of the site. " +
          hazard.note,
      });
    } else if (hazard.rank > 0) {
      findings.push({
        level: hazard.rank >= 2 ? "caution" : "caution",
        text:
          hazard.label +
          " over ~" +
          affectedPct +
          "% of the site. " +
          hazard.note,
      });
    }

    if (mhfl_m != null) {
      findings.push({
        level: "caution",
        text:
          "Habitable floor level must be at or above RL " +
          mhfl_m.toFixed(2) +
          " m AHD (Defined Flood Level " +
          Number(input.dfl_m).toFixed(2) +
          " + " +
          freeboard.toFixed(2) +
          " m freeboard).",
      });
      if (fillOrRaise_m != null) {
        if (fillOrRaise_m > 0) {
          findings.push({
            level: fillOrRaise_m > 1.0 ? "caution" : "info",
            text:
              "Floor sits ~" +
              fillOrRaise_m.toFixed(2) +
              " m above natural ground — expect raised/suspended floor or engineered fill (cost + drainage impact).",
          });
        } else {
          findings.push({
            level: "pass",
            text: "Natural ground is already above the required floor level.",
          });
        }
      }
    }

    if (input.stormTide) {
      findings.push({
        level: "caution",
        text:
          "Storm-tide inundation mapped (coastal). Council will apply a storm-tide floor level and, in some zones, restrict intensification. Treat as an additional floor-level control.",
      });
    }

    return {
      hazard: hazard,
      hazardKey: input.hazard || "none",
      affectedPct: affectedPct,
      developableExclusion: developableExclusion, // 0..1 of whole site
      developableFactor: round3(1 - developableExclusion),
      mhfl_m: mhfl_m,
      fillOrRaise_m: fillOrRaise_m,
      stormTide: !!input.stormTide,
      isKnockout: hazard.knockout && affectedPct >= 40, // dominant constraint
      findings: findings,
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function isNum(v) { return typeof v === "number" && !isNaN(v); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  window.SiteFit = window.SiteFit || {};
  window.SiteFit.flood = { assess: assess, HAZARD: HAZARD };
})();
