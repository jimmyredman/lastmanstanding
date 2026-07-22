/*
 * Orchestration test for api/lookup with a mocked fetch. Proves the handler
 * wires cadastre -> council -> zoning -> flood-override correctly and
 * normalizes the model, independent of live network. Run: node test/lookup.test.mjs
 */
import { lookup } from "../api/lookup.mjs";

// --- Fixtures: a 40x25 m parcel near Townsville ---
const lat0 = -19.26, lng0 = 146.82;
const dLat = 25 / 111320;
const dLng = 40 / (111320 * Math.cos((lat0 * Math.PI) / 180));
const rect = [[lng0, lat0], [lng0 + dLng, lat0], [lng0 + dLng, lat0 + dLat], [lng0, lat0 + dLat], [lng0, lat0]];
const northHalf = [[lng0, lat0 + dLat / 2], [lng0 + dLng, lat0 + dLat / 2], [lng0 + dLng, lat0 + dLat], [lng0, lat0 + dLat], [lng0, lat0 + dLat / 2]];

function feat(rings, attributes) { return { attributes, geometry: { rings } }; }
const J = (obj) => ({ ok: true, status: 200, json: async () => obj });

// Route mocked fetch by URL.
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("LandParcelPropertyFramework") && u.includes("/query"))
    return J({ features: [feat([rect], { lotplan: "3RP12345", lot_area: 1000 })] });
  if (u.includes("AdminBoundariesFramework") && u.includes("/layers"))
    return J({ layers: [{ id: 5, name: "Local Government Area boundaries" }] });
  if (u.includes("AdminBoundariesFramework") && u.includes("/query"))
    return J({ features: [{ attributes: { lga: "Townsville City Council" } }] });
  if (u.includes("floodplain_assessment_overlay") && u.includes("/query"))
    return J({ features: [feat([northHalf], { level: 1 })] }); // screening: north half
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

const r = await lookup({ lotplan: "3RP12345" });
console.log(JSON.stringify(r, null, 2));

ok("no error", !r.error, r.error);
ok("lotplan", r.lotplan === "3RP12345");
ok("area from attribute (1000)", r.area_m2 === 1000, r.area_m2);
ok("frontage ~25", Math.abs(r.frontage_m - 25) < 1, r.frontage_m);
ok("council identified", r.council === "Townsville City Council", r.council);
ok("pack id linked", r.councilPackId === "townsville", r.councilPackId);
ok("zone mapped to LDR", r.zone.packKey === "LDR", JSON.stringify(r.zone));
ok("council flood overrides screening", r.flood.authoritative === true, JSON.stringify(r.flood));
ok("hazard = high", r.flood.hazard === "high", r.flood.hazard);
ok("affected ~100%", r.flood.affectedPct >= 95, r.flood.affectedPct);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
