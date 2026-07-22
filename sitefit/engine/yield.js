/*
 * SiteFit — Yield engine
 * ----------------------
 * Given a site, a council pack, a zone and a chosen development type, work out
 * an INDICATIVE yield and run the core compliance checks. Flood exclusions are
 * applied to the developable area first, so the flood picture flows through
 * into every number.
 *
 * Every result is indicative decision-support only — it cites the control it
 * used so a planner can audit it. It is not an approval or a certified design.
 */
(function () {
  "use strict";

  /*
   * site = { area_m2, frontage_m, groundLevel_m? }
   * options = { councilId, zoneCode, devType, flood(input) }
   */
  function assess(site, options) {
    const pack = window.SiteFit.schemes.get(options.councilId);
    if (!pack) return err("Unknown council.");
    const zone = pack.zones[options.zoneCode];
    if (!zone) return err("Zone not found in this council pack.");

    const flood = window.SiteFit.flood.assess(options.flood || {}, pack);

    // Developable area after flood exclusion.
    const area = num(site.area_m2);
    const frontage = num(site.frontage_m);
    const developable = round0(area * flood.developableFactor);
    const depth = frontage > 0 ? round1(area / frontage) : null;

    const ctx = { pack, zone, site, flood, area, frontage, developable, depth };

    let result;
    if (options.devType === "subdivision") result = subdivision(ctx);
    else if (options.devType === "duplex") result = duplex(ctx);
    else return err("Unsupported development type.");

    // Merge flood findings into the compliance list, flood first.
    result.checks = flood.findings
      .map((f) => ({ ...f, group: "Flood & storm tide" }))
      .concat(result.checks);

    result.flood = flood;
    result._site = site;
    result.developable_m2 = developable;
    result.depth_m = depth;
    result.zone = { code: zone.code, name: zone.name };
    result.council = pack.name;
    result.scheme = pack.scheme + " (" + pack.schemeVersion + ")";
    return result;
  }

  // --- Land subdivision (Reconfiguring a Lot) --------------------------------
  function subdivision(ctx) {
    const { zone, area, frontage, developable, flood } = ctx;
    const checks = [];
    const minLot = zone.minLotSize_m2;
    const minFront = zone.minFrontage_m;

    // Lots that fit along the existing frontage without an internal road.
    const frontageLots = minFront > 0 ? Math.floor(frontage / minFront) : 0;

    // Raw capacity by area.
    const rawByArea = Math.floor(developable / minLot);

    // If area supports more lots than the frontage can serve, an internal road
    // / access is required -> apply an efficiency factor for the reserve.
    let roadReserve = false;
    let efficiency = 1.0;
    if (rawByArea > frontageLots) {
      roadReserve = true;
      efficiency = 0.8; // ~20% for internal road/access + drainage reserve
    }
    let lots = Math.floor((developable * efficiency) / minLot);
    if (flood.isKnockout) {
      checks.push({
        level: "fail",
        group: "Yield",
        text: "Dominant flood constraint — subdivision not supported over the affected land. Yield shown reflects unaffected area only.",
      });
    }
    lots = Math.max(0, lots);

    // Compliance checks.
    checks.push(chk(
      area >= minLot,
      "Minimum lot size " + minLot + " m² (zone " + zone.code + ")",
      "Site " + area + " m² — " + (area >= minLot ? "supports at least one compliant lot." : "below one minimum lot; not subdividable."),
      "Reconfiguring a lot code"
    ));
    checks.push(chk(
      frontage >= minFront,
      "Minimum frontage " + minFront + " m",
      "Site frontage " + frontage + " m.",
      "Reconfiguring a lot code"
    ));
    if (roadReserve) {
      checks.push({
        level: "caution", group: "Yield",
        text: "Yield exceeds what the existing frontage can serve — an internal road/access reserve is assumed (~20% area). Road layout to be confirmed at design.",
        ref: "Reconfiguring a lot code",
      });
    }

    return {
      devType: "subdivision",
      devTypeLabel: "Land subdivision (Reconfiguring a Lot)",
      headline: lots,
      headlineUnit: lots === 1 ? "lot" : "lots",
      assumptions: [
        "Minimum lot size " + minLot + " m², frontage " + minFront + " m.",
        roadReserve ? "Internal road/access reserve assumed (efficiency 0.8)." : "Lots assumed to front existing road (no internal road).",
        "Developable area after flood exclusion: " + developable + " m² of " + area + " m².",
      ],
      metrics: [
        { label: "Developable area", value: developable + " m²" },
        { label: "Min lot size", value: minLot + " m²" },
        { label: "Frontage lots (no road)", value: String(frontageLots) },
        { label: "Road reserve applied", value: roadReserve ? "Yes (~20%)" : "No" },
      ],
      checks: checks,
      layout: { kind: "subdivision", lots, roadReserve },
    };
  }

  // --- Dual occupancy / duplex ----------------------------------------------
  function duplex(ctx) {
    const { zone, area, frontage, developable } = ctx;
    const checks = [];
    const rule = zone.dualOcc || { permitted: false };

    if (!rule.permitted) {
      checks.push({
        level: "fail", group: "Land use",
        text: "Dual occupancy is not an anticipated use in the " + zone.name + " zone under this scheme.",
        ref: "Table of assessment",
      });
      return {
        devType: "duplex",
        devTypeLabel: "Dual occupancy (duplex)",
        headline: 0, headlineUnit: "dwellings",
        assumptions: ["Dual occupancy not supported in this zone."],
        metrics: [], checks,
        layout: { kind: "duplex", dwellings: 0 },
      };
    }

    const meetsArea = developable >= rule.minLotSize_m2;
    const meetsFront = frontage >= rule.minFrontage_m;
    const feasible = meetsArea && meetsFront;
    const dwellings = feasible ? 2 : (developable >= zone.minLotSize_m2 ? 1 : 0);

    const maxFootprint = round0(area * (zone.maxSiteCover_pct / 100));
    const requiredPOS = zone.privateOpenSpace_m2 * 2;
    const parking = rule.parkingPerDwelling * 2 + (rule.visitorParkingPer2Dwellings || 0);

    checks.push(chk(
      meetsArea,
      "Minimum lot for dual occupancy " + rule.minLotSize_m2 + " m²",
      "Developable area " + developable + " m² (after flood exclusion).",
      "Dwelling / dual occupancy code"
    ));
    checks.push(chk(
      meetsFront,
      "Minimum frontage " + rule.minFrontage_m + " m",
      "Site frontage " + frontage + " m.",
      "Dwelling / dual occupancy code"
    ));
    checks.push({
      level: "info", group: "Built form",
      text: "Max site cover " + zone.maxSiteCover_pct + "% ≈ " + maxFootprint + " m² total building footprint. Height limit " + zone.maxHeight_m + " m / " + zone.maxStoreys + " storeys.",
      ref: "Dwelling code",
    });
    checks.push({
      level: "info", group: "Amenity",
      text: "Private open space required ≈ " + requiredPOS + " m² total (" + zone.privateOpenSpace_m2 + " m²/dwelling). Setbacks front " + zone.setbacks_m.front + " m, side " + zone.setbacks_m.side + " m, rear " + zone.setbacks_m.rear + " m.",
      ref: "Dwelling code",
    });
    checks.push({
      level: "info", group: "Parking",
      text: "Car parking ≈ " + parking + " spaces (" + rule.parkingPerDwelling + "/dwelling" + (rule.visitorParkingPer2Dwellings ? " + visitor" : "") + ").",
      ref: "Parking code",
    });

    return {
      devType: "duplex",
      devTypeLabel: "Dual occupancy (duplex)",
      headline: dwellings,
      headlineUnit: dwellings === 1 ? "dwelling" : "dwellings",
      assumptions: [
        "Dual occupancy min lot " + rule.minLotSize_m2 + " m², frontage " + rule.minFrontage_m + " m.",
        "Developable area after flood exclusion: " + developable + " m².",
        feasible ? "Site supports a two-dwelling duplex." : (dwellings === 1 ? "Site supports a single dwelling only." : "Site does not meet minimum standards."),
      ],
      metrics: [
        { label: "Developable area", value: developable + " m²" },
        { label: "Max footprint", value: maxFootprint + " m²" },
        { label: "POS required", value: requiredPOS + " m²" },
        { label: "Parking", value: parking + " spaces" },
      ],
      checks: checks,
      layout: { kind: "duplex", dwellings, setbacks: zone.setbacks_m, siteCover: zone.maxSiteCover_pct },
    };
  }

  // --- helpers ---------------------------------------------------------------
  function chk(pass, title, detail, ref) {
    return { level: pass ? "pass" : "fail", group: "Planning controls", text: title + " — " + detail, ref };
  }
  function err(msg) { return { error: msg, checks: [], headline: "—" }; }
  function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
  function round0(v) { return Math.round(v); }
  function round1(v) { return Math.round(v * 10) / 10; }

  window.SiteFit = window.SiteFit || {};
  window.SiteFit.yield = { assess };
})();
