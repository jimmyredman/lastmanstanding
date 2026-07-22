/*
 * SiteFit — Geometry helpers
 * --------------------------
 * Pure functions that turn a cadastral parcel polygon (lng/lat rings, as
 * returned by the QLD DCDB ArcGIS service) into the numbers the yield engine
 * needs: area, an estimated street frontage and depth, and the proportion of
 * the parcel covered by a flood overlay.
 *
 * No dependencies, no network — so this is unit-tested directly (see
 * test/geo.test.mjs). The same code runs in the browser and in the serverless
 * lookup handler.
 */
(function (root) {
  "use strict";

  const R = 6378137; // earth radius (m), WGS84/GDA2020 close enough at parcel scale

  // Convert a ring of [lng,lat] degrees to local planar metres about a
  // reference latitude (equirectangular). Accurate to well under 1% over a
  // single parcel — fine for indicative areas and dimensions.
  function ringToMeters(ring, refLat) {
    const latRad = (refLat * Math.PI) / 180;
    const mPerDegLat = (Math.PI / 180) * R;
    const mPerDegLng = mPerDegLat * Math.cos(latRad);
    return ring.map(function (p) {
      return [p[0] * mPerDegLng, p[1] * mPerDegLat];
    });
  }

  function centroidLat(ring) {
    let s = 0;
    for (const p of ring) s += p[1];
    return ring.length ? s / ring.length : 0;
  }

  // Shoelace area (m2) of a ring given in metres.
  function shoelaceArea(m) {
    let a = 0;
    for (let i = 0, j = m.length - 1; i < m.length; j = i++) {
      a += m[j][0] * m[i][1] - m[i][0] * m[j][1];
    }
    return Math.abs(a) / 2;
  }

  function areaM2(ring) {
    if (!ring || ring.length < 3) return 0;
    return shoelaceArea(ringToMeters(ring, centroidLat(ring)));
  }

  // Ray-casting point-in-ring. pt and ring in the same coordinate space.
  function pointInRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const hit = (yi > pt[1]) !== (yj > pt[1]) &&
        pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
      if (hit) inside = !inside;
    }
    return inside;
  }

  function bbox(ring) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const p of ring) {
      if (p[0] < minx) minx = p[0];
      if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1];
      if (p[1] > maxy) maxy = p[1];
    }
    return { minx, miny, maxx, maxy };
  }

  /*
   * Estimate frontage & depth (m) via the minimum-area bounding rectangle
   * (rotating-calipers-lite: test every edge orientation, keep the smallest).
   * Without road data we can't know which side faces the street, so we take
   * the SHORTER side as frontage and the longer as depth — the usual case for
   * residential lots. Flagged as an estimate the user can override.
   */
  function frontageDepth(ring) {
    if (!ring || ring.length < 3) return { frontage: 0, depth: 0 };
    const m = ringToMeters(ring, centroidLat(ring));
    let best = null;
    for (let i = 0, j = m.length - 1; i < m.length; j = i++) {
      const dx = m[i][0] - m[j][0];
      const dy = m[i][1] - m[j][1];
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const ux = dx / len, uy = dy / len; // edge direction
      // project all points onto edge dir (u) and its normal (v)
      let minu = Infinity, maxu = -Infinity, minv = Infinity, maxv = -Infinity;
      for (const p of m) {
        const pu = p[0] * ux + p[1] * uy;
        const pv = -p[0] * uy + p[1] * ux;
        if (pu < minu) minu = pu; if (pu > maxu) maxu = pu;
        if (pv < minv) minv = pv; if (pv > maxv) maxv = pv;
      }
      const w = maxu - minu, h = maxv - minv;
      const area = w * h;
      if (!best || area < best.area) best = { area, w, h };
    }
    if (!best) return { frontage: 0, depth: 0 };
    const a = Math.min(best.w, best.h), b = Math.max(best.w, best.h);
    return { frontage: round1(a), depth: round1(b) };
  }

  /*
   * Proportion (0..100) of the parcel covered by one or more overlay polygons,
   * estimated by sampling a grid of points inside the parcel and testing each
   * against the overlay rings. Uses only point-in-polygon, so it's robust and
   * unit-testable; accuracy rises with `n` (default 40x40).
   *
   *   parcelRing : [[lng,lat],...]
   *   overlays   : array of rings [[lng,lat],...]
   */
  function overlapPercent(parcelRing, overlays, n) {
    if (!parcelRing || parcelRing.length < 3) return 0;
    if (!overlays || !overlays.length) return 0;
    n = n || 40;
    const bb = bbox(parcelRing);
    let inParcel = 0, covered = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) {
        const x = bb.minx + ((i + 0.5) / n) * (bb.maxx - bb.minx);
        const y = bb.miny + ((k + 0.5) / n) * (bb.maxy - bb.miny);
        if (!pointInRing([x, y], parcelRing)) continue;
        inParcel++;
        for (const ov of overlays) {
          if (pointInRing([x, y], ov)) { covered++; break; }
        }
      }
    }
    if (inParcel === 0) return 0;
    return Math.round((covered / inParcel) * 100);
  }

  function round1(v) { return Math.round(v * 10) / 10; }

  const api = { areaM2, frontageDepth, overlapPercent, pointInRing, bbox, ringToMeters };

  // Export for browser (window.SiteFit.geo) and Node (module.exports).
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SiteFit = root.SiteFit || {};
  root.SiteFit.geo = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
