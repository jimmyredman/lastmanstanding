// POST /api/reminders  — two-way bridge to Apple Reminders over iCloud CalDAV.
//
// Body:
//   { action: "list" }                          -> { items: Reminder[] }
//   { action: "create", title, notes?, due? }   -> { ok: true, uid }
//   { action: "complete", uid }                  -> { ok: true }   (marks done)
//
// Env (set in Vercel → Project → Settings → Environment Variables):
//   ICLOUD_USERNAME        your Apple ID email
//   ICLOUD_APP_PASSWORD    an app-specific password (appleid.apple.com → Sign-In & Security)
//   ICLOUD_REMINDERS_URL   (optional) the CalDAV collection URL of the list to use.
//                          If omitted we auto-discover your default reminders list.
//
// Apple Reminders are VTODO items on iCloud's CalDAV server. There's no cleaner
// public API — this is the supported path.

const BASE = "https://caldav.icloud.com";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const user = process.env.ICLOUD_USERNAME;
  const pass = process.env.ICLOUD_APP_PASSWORD;
  if (!user || !pass) {
    res.status(501).json({ error: "not_configured", message: "Set ICLOUD_USERNAME and ICLOUD_APP_PASSWORD in Vercel to enable Apple Reminders." });
    return;
  }
  const auth = "Basic " + Buffer.from(user + ":" + pass).toString("base64");
  const body = await readBody(req);
  const action = body.action || "list";

  try {
    const collection = process.env.ICLOUD_REMINDERS_URL || (await discoverRemindersCollection(auth));
    if (!collection) {
      res.status(500).json({ error: "no_list", message: "Could not find a reminders list. Set ICLOUD_REMINDERS_URL to the CalDAV URL of your list." });
      return;
    }

    if (action === "create") {
      const uid = "rjg-" + rand() + "@rjg-scribe";
      const ics = buildVTodo({ uid, title: body.title || "Untitled", notes: body.notes || "", due: body.due || null });
      const url = collection.replace(/\/?$/, "/") + uid + ".ics";
      const r = await fetch(url, { method: "PUT", headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8", "If-None-Match": "*" }, body: ics });
      if (!r.ok && r.status !== 201 && r.status !== 204) throw new Error("PUT " + r.status);
      res.status(200).json({ ok: true, uid });
      return;
    }

    if (action === "complete") {
      const found = await findByUid(auth, collection, body.uid);
      if (!found) { res.status(404).json({ error: "not_found" }); return; }
      const done = found.ics.replace(/END:VTODO/, "STATUS:COMPLETED\r\nPERCENT-COMPLETE:100\r\nEND:VTODO");
      const r = await fetch(found.href.startsWith("http") ? found.href : BASE + found.href, {
        method: "PUT", headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8" }, body: done,
      });
      if (!r.ok && r.status !== 204) throw new Error("PUT " + r.status);
      res.status(200).json({ ok: true });
      return;
    }

    // default: list
    const items = await listTodos(auth, collection);
    res.status(200).json({ items });
  } catch (e) {
    res.status(500).json({ error: "caldav_error", message: (e && e.message) || String(e) });
  }
};

// --------------------------------------------------------------- CalDAV -----

async function discoverRemindersCollection(auth) {
  // 1) current-user-principal
  const p1 = await propfind(BASE + "/", auth, 0,
    `<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);
  const principal = firstHref(p1, "current-user-principal");
  if (!principal) return null;
  // 2) calendar-home-set
  const p2 = await propfind(absolute(principal), auth, 0,
    `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`);
  const home = firstHref(p2, "calendar-home-set");
  if (!home) return null;
  // 3) collections under home that support VTODO
  const p3 = await propfind(absolute(home), auth, 1,
    `<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`);
  const responses = p3.split(/<[a-z]*:?response>/i).slice(1);
  for (const chunk of responses) {
    if (/VTODO/i.test(chunk)) {
      const href = (chunk.match(/<[a-z]*:?href>([^<]+)<\/[a-z]*:?href>/i) || [])[1];
      if (href) return absolute(href);
    }
  }
  return null;
}

async function listTodos(auth, collection) {
  const xml =
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
    `<d:prop><d:getetag/><c:calendar-data/></d:prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>` +
    `</c:calendar-query>`;
  const r = await fetch(absolute(collection), {
    method: "REPORT", headers: { Authorization: auth, Depth: "1", "Content-Type": "application/xml; charset=utf-8" }, body: xml,
  });
  const body = await r.text();
  const responses = body.split(/<[a-z]*:?response>/i).slice(1);
  const items = [];
  for (const chunk of responses) {
    const href = (chunk.match(/<[a-z]*:?href>([^<]+)<\/[a-z]*:?href>/i) || [])[1];
    const data = decodeXml((chunk.match(/<[a-z]*:?calendar-data[^>]*>([\s\S]*?)<\/[a-z]*:?calendar-data>/i) || [])[1] || "");
    if (!data) continue;
    if (/STATUS:COMPLETED/i.test(data)) continue; // show only open reminders
    items.push({
      uid: field(data, "UID"),
      title: field(data, "SUMMARY"),
      notes: field(data, "DESCRIPTION"),
      due: field(data, "DUE"),
      href,
    });
  }
  return items;
}

async function findByUid(auth, collection, uid) {
  const all = await listTodosRaw(auth, collection);
  return all.find((x) => field(x.ics, "UID") === uid) || null;
}

async function listTodosRaw(auth, collection) {
  const xml =
    `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">` +
    `<d:prop><c:calendar-data/></d:prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>` +
    `</c:calendar-query>`;
  const r = await fetch(absolute(collection), {
    method: "REPORT", headers: { Authorization: auth, Depth: "1", "Content-Type": "application/xml; charset=utf-8" }, body: xml,
  });
  const body = await r.text();
  return body.split(/<[a-z]*:?response>/i).slice(1).map((chunk) => ({
    href: (chunk.match(/<[a-z]*:?href>([^<]+)<\/[a-z]*:?href>/i) || [])[1],
    ics: decodeXml((chunk.match(/<[a-z]*:?calendar-data[^>]*>([\s\S]*?)<\/[a-z]*:?calendar-data>/i) || [])[1] || ""),
  }));
}

async function propfind(url, auth, depth, xml) {
  const r = await fetch(url, { method: "PROPFIND", headers: { Authorization: auth, Depth: String(depth), "Content-Type": "application/xml; charset=utf-8" }, body: xml });
  return r.text();
}

// ------------------------------------------------------------- helpers ------

function buildVTodo({ uid, title, notes, due }) {
  const stamp = toICSDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RJG Scribe//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VTODO", "UID:" + uid, "DTSTAMP:" + stamp, "SUMMARY:" + esc(title),
  ];
  if (notes) lines.push("DESCRIPTION:" + esc(notes));
  if (due) { const d = new Date(due); if (!isNaN(d)) lines.push("DUE:" + toICSDate(d)); }
  lines.push("STATUS:NEEDS-ACTION", "END:VTODO", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function toICSDate(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
}
function pad(n) { return String(n).padStart(2, "0"); }
function esc(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function field(ics, name) {
  const m = ics.match(new RegExp("^" + name + "(?:;[^:]*)?:(.*)$", "im"));
  return m ? m[1].trim().replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\") : "";
}
function firstHref(xml, propName) {
  const seg = (xml.match(new RegExp("<[a-z]*:?" + propName + "[^>]*>([\\s\\S]*?)<\\/[a-z]*:?" + propName + ">", "i")) || [])[1] || "";
  return (seg.match(/<[a-z]*:?href>([^<]+)<\/[a-z]*:?href>/i) || [])[1] || null;
}
function absolute(href) { return /^https?:/i.test(href) ? href : BASE + href; }
function decodeXml(s) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"'); }
function rand() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = ""; req.on("data", (c) => (raw += c));
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}
