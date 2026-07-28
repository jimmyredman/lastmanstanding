# Scribe — Setup

Scribe is a self-contained PWA in this `/assistant` folder. It runs the moment
it's deployed (on-device/local mode), then gets cloud sync + AI + integrations
as you wire each one below. Do them in order; each is independent.

Everything is priced/spoken ex-GST — that's just context passed to the AI, no billing here.

---

## 0. Deploy to Vercel (5 min) — gets it live

1. Push this repo to GitHub (see repo root instructions).
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
3. **Root Directory** → set to `assistant` (this is the key step that makes it
   its *own* project, separate from Last Man Standing).
4. Framework preset: **Other**. No build command, output dir `.` (leave default).
5. Deploy. You'll get a URL like `rjg-scribe.vercel.app`.
6. On iPad/iPhone: open the URL in Safari → **Share → Add to Home Screen**.
   The icon is your "one touch" launcher; it opens straight into Capture.

At this point Capture → Review → Organised all work, stored **on that device**.
The steps below add cloud sync and the smart features.

---

## 1. Firebase — cloud sync across iPad + web (10 min)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
   (a NEW project, e.g. `rjg-scribe` — keep it separate from Last Man Standing).
2. **Build → Authentication → Get started** → enable **Email/Password** and **Google**.
3. **Build → Firestore Database → Create database** → Production mode → pick
   `australia-southeast1` (Sydney).
4. **Firestore → Rules** → paste the contents of `firestore.rules` → **Publish**.
5. **Project settings (gear) → Your apps → Web (`</>`)** → register an app → copy
   the `firebaseConfig` object.
6. Paste it over the `firebaseConfig` placeholder near the top of `index.html`
   (the block that starts `var firebaseConfig = {`). Commit + push. Vercel redeploys.
7. **Authentication → Settings → Authorized domains** → add your Vercel domain.

Done → the app now shows a sign-in screen and syncs everything to the cloud.

---

## 2. Claude AI sorting (5 min) — the smart categoriser

You chose to wire this up now. The endpoint `api/parse.js` reads one secret.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com) → **API Keys**.
2. Vercel → your project → **Settings → Environment Variables** → add:
   - `ANTHROPIC_API_KEY` = your key
   - *(optional)* `ANTHROPIC_MODEL` = `claude-sonnet-5` (default; a good speed/cost balance)
3. Redeploy.

Until the key is set, Scribe uses a built-in rules-based parser so nothing breaks
— it just gets much smarter once the key is in.

---

## 3. Apple Reminders — iCloud CalDAV (10 min)

You chose two-way CalDAV sync. `api/reminders.js` pushes/reads Apple Reminders.

1. [appleid.apple.com](https://appleid.apple.com) → **Sign-In & Security →
   App-Specific Passwords** → generate one (label it "Scribe"). Copy it.
2. Vercel → **Settings → Environment Variables** → add:
   - `ICLOUD_USERNAME` = your Apple ID email
   - `ICLOUD_APP_PASSWORD` = the app-specific password from step 1
   - *(optional)* `ICLOUD_REMINDERS_URL` = the CalDAV URL of a specific list.
     Leave blank and Scribe auto-discovers your default Reminders list. If
     discovery fails, set this — the format is
     `https://caldav.icloud.com/<id>/calendars/<list-id>/`.
3. Redeploy. In Organised, the 🔔 button on any item now drops it into Apple Reminders.

> Note: Apple **Notes** has no API at all — nothing can read your existing Notes
> from a web app. Scribe keeps its own notes (type = Note) instead, which you can
> push out to Reminders. That's the only supported bridge to Apple.

---

## 4. Outlook calendar — Microsoft Graph (15 min)

`api/outlook/{auth,callback,calendar}.js` handle sign-in and read your calendar.

1. [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID → App
   registrations → New registration**.
   - Name: `RJG Scribe`
   - Supported account types: *Accounts in any org directory and personal
     Microsoft accounts* (or single-tenant if it's RJG-only).
   - Redirect URI: **Web** → `https://<your-vercel-domain>/api/outlook/callback`
2. Copy the **Application (client) ID**.
3. **Certificates & secrets → New client secret** → copy the **Value**.
4. **API permissions → Add → Microsoft Graph → Delegated →** `Calendars.Read`,
   `offline_access`, `openid`, `profile` → Grant admin consent if prompted.
5. Vercel → **Settings → Environment Variables** → add:
   - `MS_CLIENT_ID` = Application (client) ID
   - `MS_CLIENT_SECRET` = the secret Value
   - `MS_TENANT` = `common` (or your tenant ID for RJG-only)
   - `MS_REDIRECT_URI` = `https://<your-vercel-domain>/api/outlook/callback`
6. Redeploy. **Calendar → Connect Outlook** signs you in; events then appear
   alongside your Scribe dates.

---

## Environment variables — quick reference

| Variable | Used by | Needed for |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/parse` | Smart AI sorting |
| `ANTHROPIC_MODEL` | `api/parse` | (optional) override model |
| `ICLOUD_USERNAME` | `api/reminders` | Apple Reminders |
| `ICLOUD_APP_PASSWORD` | `api/reminders` | Apple Reminders |
| `ICLOUD_REMINDERS_URL` | `api/reminders` | (optional) specific list |
| `MS_CLIENT_ID` | `api/outlook/*` | Outlook calendar |
| `MS_CLIENT_SECRET` | `api/outlook/*` | Outlook calendar |
| `MS_TENANT` | `api/outlook/*` | (optional, default `common`) |
| `MS_REDIRECT_URI` | `api/outlook/*` | Outlook calendar |

Nothing here touches Procore or any RJG system — Scribe is standalone.
