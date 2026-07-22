/*
 * Orchestration test for api/lookup with a mocked fetch. Proves the handler
 * wires cadastre -> council -> flood -> (optional) zoning correctly and
 * normalizes the model, independent of live network. Run: node test/lookup.test.mjs
 *
 * Two scenarios:
 *   A) Townsville as shipped (apiAvailable:false — its City Plan ArcGIS needs a
 *      token): cadastre + council + statewide flood screening + MANUAL zone.
 *   B) A council WITH a queryable planning service (we flip apiAvailable at
 *      runtime): the zoning + authoritative-flood-override branch runs.
 */
import { lookup } from "../api/lookup.mjs";
import councils from "../engine/councils.js";

// --- Fixtures: a 40x25 m parcel near Townsville ---
const lat0 = -19.26, lng0 = 146.82;
const dLat = 25 / 111320;
const dLng = 40 / (111320 * Math.cos((lat0 * Math.PI) / 180));
const rect = [[lng0, lat0], [lng0 + dLng, lat0], [lng0 + dLng, lat0 + dLat], [lng0, lat0 + dLat], [lng0, lat0]];
const northHalf = [[lng0, lat0 + dLat / 2], [lng0 + dLng, lat0 + dLat / 2], [lng0 + dLng, lat0 + dLat], [lng0, lat0 + dLat], [lng0, lat0 + dLat / 2]];

function feat(rings, attributes) { return { attributes, geometry: { rings } }; }
const J = (obj) => ({ ok: true, status: 200, json: async () => obj });

// Route mocked fetch by URL. The statewide flood screening now lives on the
// same AdminBoundariesFramework MapServer as the LGA layer (layer 15 vs 11),
// so the router disambiguates by layer id.
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("LandParcelPropertyFramework") && u.includes("/query"))
    return J({ features: [feat([rect], { lotplan: "3RP12345", lot_area: 1000 })] });
  if (u.includes("AdminBoundariesFramework") && u.includes("/layers"))
    return J({ layers: [{ id: 11, name: "Local Government area" }, { id: 15, name: "Floodplain assessment overlay" }] });
  if (u.includes("AdminBoundariesFramework/MapServer/15/query"))
    return J({ features: [feat([northHalf], { sub_name: "Floodplain" })] }); // screening: north half (~50%)
  if (u.includes("AdminBoundariesFramework/MapServer/11/query"))
    return J({ features: [{ attributes: { admintypename: "LOCAL GOVERNMENT", adminareaname: "TOWNSVILLE CITY", lga: "Townsville City" } }] });
  if (u.includes("EXT_CityPlanningScheme_Current") && u.includes("/layers"))
    return J({ layers: [{ id: 2, name: "Zones" }, { id: 9, name: "Flood hazard overlay" }] });
  if (u.includes("EXT_CityPlanningScheme_Current/MapServer/2/query"))
    return J({ features: [{ attributes: { zone_description: "Low density residential" } }] });
  if (u.includes("EXT_CityPlanningScheme_Current/MapServer/9/query"))
    return J({ features: [feat([rect], { hazard_category: "High hazard" })] }); // council: whole parcel high
  return J({ features: [] });
};

let pass = 0, fail = 0;
function ok(n, c, x) { c ? (pass++, console.log("  PASS " + n)) : (fail++, console.log("  FAIL " + n + (x ? " -> " + x : ""))); }

// --- Scenario A: Townsville as shipped (no public planning API) ---
console.log("Scenario A — Townsville (apiAvailable:false)");
const a = await lookup({ lotplan: "3RP12345" });
ok("A no error", !a.error, a.error);
ok("A lotplan", a.lotplan === "3RP12345");
ok("A area from attribute (1000)", a.area_m2 === 1000, a.area_m2);
ok("A frontage ~25", Math.abs(a.frontage_m - 25) < 1, a.frontage_m);
ok("A council identified", /townsville/i.test(a.council || ""), a.council);
ok("A pack id linked", a.councilPackId === "townsville", a.councilPackId);
ok("A zone NOT auto-resolved (manual)", a.zone.packKey === null, JSON.stringify(a.zone));
ok("A manual-zone warning present", a.warnings.some((w) => /manual/i.test(w)), JSON.stringify(a.warnings));
ok("A flood from statewide screening", a.flood.source && /screening/i.test(a.flood.source) && a.flood.authoritative === false, JSON.stringify(a.flood));
ok("A flood affected ~50% (north half)", Math.abs(a.flood.affectedPct - 50) <= 5, a.flood.affectedPct);

// --- Scenario B: a council WITH a queryable planning service ---
console.log("\nScenario B — council with live planning API (apiAvailable flipped true)");
const saved = councils.COUNCILS["townsville city council"].apiAvailable;
councils.COUNCILS["townsville city council"].apiAvailable = true;
const b = await lookup({ lotplan: "3RP12345" });
councils.COUNCILS["townsville city council"].apiAvailable = saved; // restore
ok("B zone mapped to LDR", b.zone.packKey === "LDR", JSON.stringify(b.zone));
ok("B council flood overrides screening", b.flood.authoritative === true, JSON.stringify(b.flood));
ok("B hazard = high", b.flood.hazard === "high", b.flood.hazard);
ok("B affected ~100%", b.flood.affectedPct >= 95, b.flood.affectedPct);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
