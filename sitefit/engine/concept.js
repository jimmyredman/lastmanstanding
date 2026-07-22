/*
 * SiteFit — Concept layout generator
 * ----------------------------------
 * Produces an INDICATIVE, to-scale SVG of the site so the yield is visibly
 * plausible — the kind of sketch you'd put on the table at a pre-lodgement
 * meeting. It is not architecturally resolved or engineered.
 *
 * The site is drawn as a rectangle (frontage x depth). Flood-affected land is
 * shaded and kept clear of new lots/footprints. A north arrow and scale bar
 * are included so it reads like a real site sketch.
 */
(function () {
  "use strict";

  const PAD = 46;         // px padding around the site
  const MAXW = 560;       // target drawing width in px

  function draw(result) {
    const site = result._site || {};
    const frontage = num(site.frontage_m) || 20;
    const depth = num(result.depth_m) || (num(site.area_m2) / frontage) || 30;

    // Scale metres -> px so the longest side fits MAXW.
    const scale = MAXW / Math.max(frontage, depth);
    const w = frontage * scale;
    const h = depth * scale;
    const W = w + PAD * 2;
    const H = h + PAD * 2 + 24;

    const layout = result.layout || {};
    const flood = result.flood || {};
    const affected = clamp((flood.affectedPct || 0) / 100, 0, 1);

    const parts = [];
    parts.push(
      '<svg viewBox="0 0 ' + r(W) + " " + r(H) + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Indicative concept layout" style="width:100%;height:auto;font-family:ui-monospace,monospace">'
    );
    // background
    parts.push('<rect x="0" y="0" width="' + r(W) + '" height="' + r(H) + '" fill="var(--sf-draw-bg)"/>');

    const ox = PAD, oy = PAD;

    // Flood shading — drawn from the rear (top) as a band across the site.
    if (affected > 0) {
      const fh = h * affected;
      parts.push(
        '<rect x="' + r(ox) + '" y="' + r(oy) + '" width="' + r(w) + '" height="' + r(fh) +
        '" fill="var(--sf-flood)" opacity="0.5"/>'
      );
      parts.push(
        '<text x="' + r(ox + 6) + '" y="' + r(oy + 16) + '" font-size="11" fill="var(--sf-flood-ink)">FLOOD-AFFECTED — kept clear</text>'
      );
    }

    // Site boundary (surveyor's magenta).
    parts.push(
      '<rect x="' + r(ox) + '" y="' + r(oy) + '" width="' + r(w) + '" height="' + r(h) +
      '" fill="none" stroke="var(--sf-boundary)" stroke-width="2"/>'
    );

    // Draw content.
    if (layout.kind === "subdivision") parts.push(drawSubdivision(ox, oy, w, h, affected, layout));
    else if (layout.kind === "duplex") parts.push(drawDuplex(ox, oy, w, h, frontage, depth, scale, affected, layout));

    // Frontage label (bottom edge = street).
    parts.push(
      '<text x="' + r(ox + w / 2) + '" y="' + r(oy + h + 26) + '" font-size="11" text-anchor="middle" fill="var(--sf-ink)">STREET FRONTAGE — ' + r(frontage) + " m</text>"
    );
    // Depth label (left edge, rotated).
    parts.push(
      '<text transform="translate(' + r(ox - 14) + "," + r(oy + h / 2) + ') rotate(-90)" font-size="11" text-anchor="middle" fill="var(--sf-ink)">' + r(depth) + " m</text>"
    );

    // North arrow (top-right).
    const nx = W - 26, ny = 30;
    parts.push('<line x1="' + nx + '" y1="' + (ny + 12) + '" x2="' + nx + '" y2="' + (ny - 10) + '" stroke="var(--sf-ink)" stroke-width="1.5"/>');
    parts.push('<path d="M' + nx + " " + (ny - 14) + " L" + (nx - 4) + " " + (ny - 6) + " L" + (nx + 4) + " " + (ny - 6) + ' Z" fill="var(--sf-ink)"/>');
    parts.push('<text x="' + nx + '" y="' + (ny + 24) + '" font-size="9" text-anchor="middle" fill="var(--sf-ink)">N</text>');

    parts.push("</svg>");
    return parts.join("");
  }

  function drawSubdivision(ox, oy, w, h, affected, layout) {
    const lots = Math.max(0, layout.lots || 0);
    if (lots === 0) return "";
    const usableTop = oy + h * affected; // keep lots below flood band
    const usableH = h - h * affected;

    // Grid the usable area into ~square-ish lots.
    const cols = Math.max(1, Math.round(Math.sqrt(lots * (w / usableH || 1))));
    const rows = Math.ceil(lots / cols);
    const cw = w / cols;
    const rh = usableH / rows;
    let out = "";
    let n = 0;
    // Internal road strip if a reserve was applied.
    let roadY = null;
    if (layout.roadReserve && rows > 1) {
      roadY = usableTop + usableH / 2 - rh * 0.18;
      out += '<rect x="' + r(ox) + '" y="' + r(roadY) + '" width="' + r(w) + '" height="' + r(rh * 0.36) +
        '" fill="var(--sf-road)"/>';
    }
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols && n < lots; ci++) {
        const x = ox + ci * cw;
        let y = usableTop + ri * rh;
        let hh = rh;
        if (roadY != null && y >= roadY) { y += rh * 0.36; }
        out += '<rect x="' + r(x + 3) + '" y="' + r(y + 3) + '" width="' + r(cw - 6) + '" height="' + r(hh - 6) +
          '" fill="var(--sf-lot)" stroke="var(--sf-lot-line)" stroke-width="1"/>';
        out += '<text x="' + r(x + cw / 2) + '" y="' + r(y + hh / 2 + 4) + '" font-size="11" text-anchor="middle" fill="var(--sf-ink)">' + (++n) + "</text>";
      }
    }
    return out;
  }

  function drawDuplex(ox, oy, w, h, frontage, depth, scale, affected, layout) {
    const dwellings = layout.dwellings || 0;
    if (dwellings === 0) return "";
    const sb = layout.setbacks || { front: 6, side: 1.5, rear: 3 };
    const front = sb.front * scale, side = sb.side * scale, rear = sb.rear * scale;
    // Envelope (dashed) — flood band pushes the rear setback down if needed.
    const floodPx = h * affected;
    const ey = oy + Math.max(rear, floodPx);
    const ex = ox + side;
    const ew = w - side * 2;
    const eh = h - Math.max(rear, floodPx) - front;
    let out = '<rect x="' + r(ex) + '" y="' + r(ey) + '" width="' + r(ew) + '" height="' + r(eh) +
      '" fill="none" stroke="var(--sf-ink)" stroke-dasharray="5 4" stroke-width="1"/>';
    out += '<text x="' + r(ex + 4) + '" y="' + r(ey - 5) + '" font-size="9" fill="var(--sf-ink)">buildable envelope (setbacks)</text>';
    // Two footprints side by side within the envelope.
    const gap = 6;
    const fw = (ew - gap * 3) / 2;
    const fh = eh * 0.62;
    const fy = ey + eh - fh; // toward street
    for (let i = 0; i < dwellings; i++) {
      const fx = ex + gap + i * (fw + gap);
      out += '<rect x="' + r(fx) + '" y="' + r(fy) + '" width="' + r(fw) + '" height="' + r(fh) +
        '" fill="var(--sf-dwelling)" stroke="var(--sf-lot-line)" stroke-width="1"/>';
      out += '<text x="' + r(fx + fw / 2) + '" y="' + r(fy + fh / 2 + 4) + '" font-size="10" text-anchor="middle" fill="var(--sf-ink)">Unit ' + (i + 1) + "</text>";
    }
    return out;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
  function r(v) { return Math.round(v * 10) / 10; }

  window.SiteFit = window.SiteFit || {};
  window.SiteFit.concept = { draw };
})();
