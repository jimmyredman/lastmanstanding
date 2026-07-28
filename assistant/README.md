# Scribe — RJG Assistant

A voice-first reminder & organiser PWA. Standalone from Last Man Standing.
Speak a brain-dump → AI splits and sorts it into tasks / events / notes / ideas
with dates, jobs and keywords → you review, tweak and approve → it's organised,
searchable, and can flow out to Apple Reminders and sit alongside your Outlook
calendar. Runs on iPad, iPhone and web; installs to the home screen.

**Stack:** single-file PWA (React + Tailwind + Firebase via CDN, no build step),
Vercel serverless functions in `/api`, Firebase Auth + Firestore. Same shape as
the other RJG apps.

## Layout
```
assistant/
  index.html            The whole app (paste your Firebase config near the top)
  manifest.webmanifest  PWA / home-screen install
  icon-512.png          Icon (swap for RJG branding when ready)
  apple-touch-icon.png
  vercel.json           Static + serverless config
  firebase.json         Firestore rules pointer
  firestore.rules       Per-user private data
  api/
    parse.js            Claude — turns dictation into structured items
    reminders.js        Apple Reminders via iCloud CalDAV
    outlook/auth.js     Microsoft sign-in
    outlook/callback.js OAuth token exchange
    outlook/calendar.js Reads your Outlook calendar
  docs/SETUP.md         Step-by-step: Vercel, Firebase, Claude, iCloud, Outlook
```

## Getting it live
See **[docs/SETUP.md](docs/SETUP.md)**. Short version: deploy to Vercel with
**Root Directory = `assistant`**, and it's live in local mode immediately. Then
wire Firebase (cloud sync), the Claude key, iCloud, and Outlook one at a time.

## Works with nothing configured
No Firebase config → runs on-device (localStorage). No Claude key → built-in
rules parser. No iCloud/Outlook → those buttons explain how to switch them on.
Wire each secret when you're ready; nothing breaks in the meantime.
