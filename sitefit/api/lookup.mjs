/*
 * SiteFit — Site lookup handler
 * -----------------------------
 * Pulls a site's facts from the real QLD web services and returns one
 * normalized model the front end can drop straight into the yield engine.
 *
 * Runs SERVER-SIDE (Vercel serverless function or the local dev server) because
 * council ArcGIS servers don't allow direct browser calls (CORS). All queries
 * force outSR=4326 so geometry comes back as lng/lat degrees, which is what
 * engine/geo.js expects.
 *
 * Inputs (query string or JSON body):
 *   ?lotplan=3RP12345           preferred, keyless
 *   ?lat=-19.26&lng=146.82      map-click / coordinates, keyless
 *   ?address=...                requires a configured QLD Geocoder key (see below)
 *
 * Every sub-lookup is wrapped so a single service outage degrades gracefully:
 * you still get whatever else resolved, with a note in `warnings`.
 */
import geo from "../engine/geo.js";
import councils from "../engine/councils.js";

const S = councils.STATEWIDE;

// ---- ArcGIS helpers --------------------------------------------------------
async function agQuery(layerUrl, params) {
  const qs = new URLSearchParams({ f: "json", outSR: "4326", ...params });
  const res = await fetch(layerUrl + "/query?" + qs.toString());
  if (!res.ok) throw new Error("ArcGIS " + res.status + " on " + layerUrl);
  const json = await res.json();
  if (json.error) throw new Error("ArcGIS error: " + JSON.stringify(json.error));
  return json;
}

// Resolve a sublayer URL inside a MapServer by matching its name.
async function resolveLayer(mapServerUrl, nameRegex) {
  const res = await fetch(mapServerUrl + "/layers?f=json");
  if (!res.ok) throw new Error("layers " + res.status);
  const json = await res.json();
  const layer = (json.layers || []).find((l) => nameRegex.test(l.name || ""));
  return layer ? mapServerUrl + "/" + layer.id : null;
}

function outerRing(feature) {
  const g = feature && feature.geometry;
  if (!g || !g.rings || !g.rings.length) return null;
  return g.rings[0];
}
function centroid(ring) {
  let x = 0, y = 0;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / ring.length, y / ring.length];
}
function polygonGeom(ring) {
  return JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } });
}
function pickField(attrs, re) {
  for (const k of Object.keys(attrs || {})) if (re.test(k)) return attrs[k];
  return null;
}

// ---- Main lookup -----------------------------------------------------------
export async function lookup(input) {
  const warnings = [];
  const sources = [];
  let parcelFeature = null;

  // 1) Resolve the parcel.
  try {
    if (input.lotplan) {
      const j = await agQuery(S.cadastre.url, {
        where: S.cadastre.lotplanField + "='" + String(input.lotplan).toUpperCase() + "'",
        outFields: "*", returnGeometry: "true", resultRecordCount: "1",
      });
      parcelFeature = (j.features || [])[0] || null;
    } else if (input.lat != null && input.lng != null) {
      const j = await agQuery(S.cadastre.url, {
        geometry: input.lng + "," + input.lat, geometryType: "esriGeometryPoint",
        inSR: "4326", spatialRel: "esriSpatialRelIntersects",
        outFields: "*", returnGeometry: "true", resultRecordCount: "1",
      });
      parcelFeature = (j.features || [])[0] || null;
    } else if (input.address) {
      return { error: "Address lookup needs a configured QLD Geocoder key. Use a lot/plan (e.g. 3RP12345) or map coordinates for keyless lookup.", warnings, sources };
    } else {
      return { error: "Provide lotplan, or lat & lng.", warnings, sources };
    }
  } catch (e) {
    return { error: "Cadastre lookup failed: " + e.message, warnings, sources };
  }
  if (!parcelFeature) return { error: "No parcel found for that input.", warnings, sources };
  sources.push("QLD DCDB cadastre");

  const ring = outerRing(parcelFeature);
  if (!ring) return { error: "Parcel returned without geometry.", warnings, sources };
  const attrs = parcelFeature.attributes || {};
  const c = centroid(ring);

  // Area: prefer the cadastre attribute, else compute from geometry.
  let area = Number(pickField(attrs, new RegExp("^" + S.cadastre.areaField + "$", "i")) || pickField(attrs, /area/i));
  if (!area || isNaN(area) || area <= 0) area = geo.areaM2(ring);
  const fd = geo.frontageDepth(ring);
  const lotplan = pickField(attrs, /lotplan/i) || input.lotplan || null;

  // 2) Identify the council (LGA boundary at the centroid).
  let councilName = null, councilRec = null;
  try {
    const lgaLayer = await resolveLayer(S.lgaBoundaries.url, S.lgaBoundaries.lgaLayerNameRegex);
    if (lgaLayer) {
      const j = await agQuery(lgaLayer, {
        geometry: c[0] + "," + c[1], geometryType: "esriGeometryPoint", inSR: "4326",
        spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", resultRecordCount: "1",
      });
      const f = (j.features || [])[0];
      if (f) { councilName = pickField(f.attributes, S.lgaBoundaries.lgaNameField); sources.push("QLD LGA boundaries"); }
    }
  } catch (e) { warnings.push("Council identification failed: " + e.message); }
  councilRec = councils.findCouncil(councilName);

  // 3) Flood — council's authoritative overlay if available, else statewide screening.
  let flood = { hazard: "none", affectedPct: 0, source: null, authoritative: false };
  // 3a) statewide screening (always attempt)
  try {
    const j = await agQuery(S.floodScreening.url, {
      geometry: polygonGeom(ring), geometryType: "esriGeometryPolygon", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "true",
    });
    const rings = (j.features || []).map(outerRing).filter(Boolean);
    if (rings.length) {
      flood = {
        hazard: "medium", // screening flags potential inundation; category refined by council overlay
        affectedPct: geo.overlapPercent(ring, rings),
        source: S.floodScreening.label, authoritative: false,
      };
      sources.push(S.floodScreening.label);
    }
  } catch (e) { warnings.push("Flood screening failed: " + e.message); }
  // 3b) council authoritative overlay (overrides screening when present)
  if (councilRec && councilRec.apiAvailable && councilRec.planning && councilRec.planning.floodLayerNameRegex) {
    try {
      const fl = await resolveLayer(councilRec.planning.url, councilRec.planning.floodLayerNameRegex);
      if (fl) {
        const j = await agQuery(fl, {
          geometry: polygonGeom(ring), geometryType: "esriGeometryPolygon", inSR: "4326",
          spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "true",
        });
        const feats = j.features || [];
        const rings = feats.map(outerRing).filter(Boolean);
        if (rings.length) {
          const hazText = String(pickField(feats[0].attributes, councilRec.planning.floodHazardField) || "");
          flood = {
            hazard: mapHazard(hazText),
            affectedPct: geo.overlapPercent(ring, rings),
            source: councilRec.key + " flood overlay", authoritative: true,
            rawHazard: hazText || null,
          };
          sources.push(councilRec.key + " flood overlay");
        }
      }
    } catch (e) { warnings.push("Council flood overlay failed: " + e.message); }
  }

  // 4) Zoning (council service).
  let zone = { name: null, packKey: null };
  if (councilRec && councilRec.apiAvailable && councilRec.planning && councilRec.planning.zoneLayerNameRegex) {
    try {
      const zl = await resolveLayer(councilRec.planning.url, councilRec.planning.zoneLayerNameRegex);
      if (zl) {
        const j = await agQuery(zl, {
          geometry: c[0] + "," + c[1], geometryType: "esriGeometryPoint", inSR: "4326",
          spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", resultRecordCount: "1",
        });
        const f = (j.features || [])[0];
        if (f) {
          const zn = pickField(f.attributes, councilRec.planning.zoneNameField);
          zone = { name: zn, packKey: councils.zoneNameToPackKey(zn) };
          sources.push(councilRec.key + " zoning");
        }
      }
    } catch (e) { warnings.push("Zoning lookup failed: " + e.message); }
  } else if (councilName) {
    warnings.push("No queryable planning service configured for " + councilName + " — zone must be entered manually.");
  }

  return {
    lotplan,
    council: councilName,
    councilPackId: councilRec ? councilRec.packId : null,
    area_m2: Math.round(area),
    frontage_m: fd.frontage,
    depth_m: fd.depth,
    centroid: { lat: c[1], lng: c[0] },
    zone,
    flood,
    sources,
    warnings,
  };
}

function mapHazard(text) {
  const t = text.toLowerCase();
  if (/floodway|conveyance/.test(t)) return "floodway";
  if (/high/.test(t)) return "high";
  if (/medium|moderate/.test(t)) return "medium";
  if (/low|minor/.test(t)) return "low";
  return "medium"; // present but uncategorised -> treat as medium, flagged for review
}

// ---- Vercel / Node serverless entry ---------------------------------------
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const q = Object.fromEntries(url.searchParams.entries());
    const input = {
      lotplan: q.lotplan,
      lat: q.lat != null ? Number(q.lat) : null,
      lng: q.lng != null ? Number(q.lng) : null,
      address: q.address,
    };
    const out = await lookup(input);
    const body = JSON.stringify(out);
    if (res.setHeader) { res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); }
    res.statusCode = out.error ? 422 : 200;
    res.end(body);
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Lookup crashed: " + e.message }));
  }
}
