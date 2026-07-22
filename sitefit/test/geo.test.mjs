/*
 * Unit tests for the geometry helpers. Run: node test/geo.test.mjs
 * These prove the transform maths (area, frontage, flood %) independently of
 * any network call, which is the part most likely to be wrong.
 */
import geo from "../engine/geo.js";

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// A ~40m (E-W) x 25m (N-S) rectangle near Townsville (-19.26, 146.82).
// 1 deg lat ~ 111,320 m; 1 deg lng ~ 111,320*cos(19.26) ~ 105,100 m.
const lat0 = -19.26, lng0 = 146.82;
const dLat = 25 / 111320;                       // 25 m north
const dLng = 40 / (111320 * Math.cos(lat0 * Math.PI / 180)); // 40 m east
const rect = [
  [lng0, lat0],
  [lng0 + dLng, lat0],
  [lng0 + dLng, lat0 + dLat],
  [lng0, lat0 + dLat],
  [lng0, lat0],
];

// --- area: expect ~1000 m2 (40x25) ---
const a = geo.areaM2(rect);
ok("rectangle area ~1000 m2", near(a, 1000, 5), a.toFixed(1));

// --- frontage/depth: shorter side 25, longer 40 ---
const fd = geo.frontageDepth(rect);
ok("frontage ~25 m", near(fd.frontage, 25, 0.5), JSON.stringify(fd));
ok("depth ~40 m", near(fd.depth, 40, 0.5), JSON.stringify(fd));

// --- point in polygon ---
ok("centre point inside", geo.pointInRing([lng0 + dLng / 2, lat0 + dLat / 2], rect));
ok("far point outside", !geo.pointInRing([lng0 + dLng * 3, lat0], rect));

// --- flood overlap: overlay covering the northern half -> ~50% ---
const half = [
  [lng0, lat0 + dLat / 2],
  [lng0 + dLng, lat0 + dLat / 2],
  [lng0 + dLng, lat0 + dLat],
  [lng0, lat0 + dLat],
  [lng0, lat0 + dLat / 2],
];
const pct = geo.overlapPercent(rect, [half], 60);
ok("northern-half overlay ~50%", near(pct, 50, 3), pct + "%");

// --- flood overlap: no overlay -> 0 ---
ok("no overlay = 0%", geo.overlapPercent(rect, [], 40) === 0);

// --- flood overlap: fully covering overlay -> ~100% ---
const bigger = [
  [lng0 - dLng, lat0 - dLat],
  [lng0 + 2 * dLng, lat0 - dLat],
  [lng0 + 2 * dLng, lat0 + 2 * dLat],
  [lng0 - dLng, lat0 + 2 * dLat],
  [lng0 - dLng, lat0 - dLat],
];
ok("full cover ~100%", geo.overlapPercent(rect, [bigger], 40) === 100);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
