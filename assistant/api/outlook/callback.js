// GET /api/outlook/callback  — Microsoft redirects here with ?code=...
// Exchanges the code for tokens, stores them in HttpOnly cookies, and bounces
// the user back into the app.
//
// Env: MS_CLIENT_ID, MS_CLIENT_SECRET (required), MS_TENANT, MS_REDIRECT_URI.

module.exports = async function handler(req, res) {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.status(501).send("Outlook not configured."); return; }

  const q = req.query || {};
  if (q.error) { res.status(400).send("Microsoft returned: " + q.error_description || q.error); return; }
  const cookies = parseCookies(req);
  if (!q.code || !q.state || q.state !== cookies.ms_state) { res.status(400).send("Bad state — try connecting again."); return; }

  const tenant = process.env.MS_TENANT || "common";
  const redirect = process.env.MS_REDIRECT_URI || derivedRedirect(req);

  const tok = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: q.code,
      redirect_uri: redirect,
      scope: "openid profile offline_access Calendars.Read",
    }),
  });
  if (!tok.ok) { res.status(500).send("Token exchange failed: " + (await tok.text()).slice(0, 300)); return; }
  const t = await tok.json();

  const secure = "Path=/; HttpOnly; Secure; SameSite=Lax";
  res.setHeader("Set-Cookie", [
    `ms_access=${t.access_token}; ${secure}; Max-Age=${t.expires_in || 3600}`,
    `ms_refresh=${t.refresh_token || ""}; ${secure}; Max-Age=${60 * 60 * 24 * 90}`,
    `ms_state=; Path=/; Max-Age=0`,
  ]);
  const back = cookies.ms_return ? decodeURIComponent(cookies.ms_return) : "/";
  res.writeHead(302, { Location: back + (back.includes("?") ? "&" : "?") + "outlook=connected" });
  res.end();
};

function parseCookies(req) {
  return (req.headers.cookie || "").split(";").reduce((a, c) => {
    const i = c.indexOf("="); if (i < 0) return a;
    a[c.slice(0, i).trim()] = c.slice(i + 1).trim(); return a;
  }, {});
}
function derivedRedirect(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}/api/outlook/callback`;
}
