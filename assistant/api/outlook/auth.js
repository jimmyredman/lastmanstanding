// GET /api/outlook/auth  — kicks off Microsoft sign-in for calendar access.
// Redirects the browser to Microsoft's consent screen. On approval Microsoft
// calls /api/outlook/callback with an auth code.
//
// Env: MS_CLIENT_ID (required), MS_TENANT (default "common"),
//      MS_REDIRECT_URI (optional; auto-derived from the request if unset).

module.exports = async function handler(req, res) {
  const clientId = process.env.MS_CLIENT_ID;
  if (!clientId) { res.status(501).json({ error: "not_configured", message: "Set MS_CLIENT_ID to enable Outlook." }); return; }
  const tenant = process.env.MS_TENANT || "common";
  const redirect = process.env.MS_REDIRECT_URI || derivedRedirect(req);
  const state = Math.random().toString(36).slice(2);

  // remember where to bounce back to in the app after auth
  const returnTo = (req.query && req.query.returnTo) || "/";
  res.setHeader("Set-Cookie", [
    `ms_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    `ms_return=${encodeURIComponent(returnTo)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  ]);

  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` + new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirect,
    response_mode: "query",
    scope: "openid profile offline_access Calendars.Read",
    state,
  });
  res.writeHead(302, { Location: url });
  res.end();
};

function derivedRedirect(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}/api/outlook/callback`;
}
