// GET /api/outlook/calendar?days=14  — returns upcoming Outlook events as JSON.
// Uses the access-token cookie, silently refreshing it when expired.
//
// Reply: { connected: boolean, events: Event[] }
//   Event = { id, subject, start, end, location, isAllDay, organizer, webLink }

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req);
  let access = cookies.ms_access;

  if (!access && cookies.ms_refresh) {
    access = await refresh(cookies.ms_refresh, res, req);
  }
  if (!access) { res.status(200).json({ connected: false, events: [] }); return; }

  const days = Math.min(60, Math.max(1, parseInt((req.query && req.query.days) || "14", 10)));
  const start = new Date();
  const end = new Date(Date.now() + days * 864e5);
  const url = `https://graph.microsoft.com/v1.0/me/calendarView?` + new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $orderby: "start/dateTime",
    $top: "50",
    $select: "id,subject,start,end,location,isAllDay,organizer,webLink",
  });

  let r = await fetch(url, { headers: { Authorization: "Bearer " + access, Prefer: 'outlook.timezone="Australia/Brisbane"' } });
  if (r.status === 401 && cookies.ms_refresh) {
    access = await refresh(cookies.ms_refresh, res, req);
    if (access) r = await fetch(url, { headers: { Authorization: "Bearer " + access, Prefer: 'outlook.timezone="Australia/Brisbane"' } });
  }
  if (!r || !r.ok) { res.status(200).json({ connected: false, events: [], error: r && (await r.text()).slice(0, 200) }); return; }

  const data = await r.json();
  const events = (data.value || []).map((e) => ({
    id: e.id,
    subject: e.subject || "(no subject)",
    start: e.start && e.start.dateTime,
    end: e.end && e.end.dateTime,
    location: (e.location && e.location.displayName) || "",
    isAllDay: !!e.isAllDay,
    organizer: (e.organizer && e.organizer.emailAddress && e.organizer.emailAddress.name) || "",
    webLink: e.webLink || "",
  }));
  res.status(200).json({ connected: true, events });
};

async function refresh(refreshToken, res, req) {
  const clientId = process.env.MS_CLIENT_ID, clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const tenant = process.env.MS_TENANT || "common";
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token",
      refresh_token: refreshToken, scope: "openid profile offline_access Calendars.Read",
    }),
  });
  if (!r.ok) return null;
  const t = await r.json();
  const secure = "Path=/; HttpOnly; Secure; SameSite=Lax";
  res.setHeader("Set-Cookie", [
    `ms_access=${t.access_token}; ${secure}; Max-Age=${t.expires_in || 3600}`,
    ...(t.refresh_token ? [`ms_refresh=${t.refresh_token}; ${secure}; Max-Age=${60 * 60 * 24 * 90}`] : []),
  ]);
  return t.access_token;
}
function parseCookies(req) {
  return (req.headers.cookie || "").split(";").reduce((a, c) => {
    const i = c.indexOf("="); if (i < 0) return a;
    a[c.slice(0, i).trim()] = c.slice(i + 1).trim(); return a;
  }, {});
}
