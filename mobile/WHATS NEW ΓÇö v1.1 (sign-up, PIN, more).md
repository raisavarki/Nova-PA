# Nova mobile — v1.1

Big update: a personalized sign-up, PIN login, insights, encrypted sync, and
reminders that fire in the background.

## ✅ Done & verified (in this build)
- **15-step personalized sign-up** — name, assistant name, what you want help
  with, work hours, habits to track, water goal, focus length, reminder style,
  theme, avatar colour, avatar on/off, quiet hours, language/units, notifications,
  and a PIN. Your answers configure the whole app.
- **PIN login (no email / no password)** — 4- or 6-digit PIN with an iOS-style
  keypad lock screen. PIN is salted + SHA-256 hashed, never stored as text.
  Auto-locks after inactivity (set the delay in More → Security). "Forgot PIN"
  resets the app (there's no email to recover with — your data is only on-device).
- **Insights** — 7-day charts for focus, tasks completed, water, and habit streaks.
- **Encrypted cross-device sync (v1)** — More → "Create sync code": your data is
  AES-256 encrypted with a pass-phrase into a code you paste on another device
  ("Enter sync code"). No server, nothing leaves your control.
- **Export / import** a full JSON backup (unchanged).
- **Share to Nova** — share text or a link from any app into Nova to make a task,
  note or reminder (via the share target).
- **Background reminders** — wired to `@capacitor/local-notifications`, so in the
  installed APK reminders alert you even when Nova is closed. Permissions are in
  the manifest; the app asks on first use / during sign-up.

## 🔧 Needs your device/accounts to finish (wired or designed, not buildable here)
- **Always-on cloud auto-sync** — v1 is manual (sync code). True auto-sync needs a
  store you control (Google Drive / Dropbox / WebDAV / a tiny endpoint). The
  encryption layer is already here; it just needs a transport.
- **Live calendar/email feed** (Outlook/Google) — needs OAuth set up with your
  account; can't be done in a sandbox.
- **Native Android home-screen widget** — the in-app widget board is done; a true
  home-screen widget is a separate Kotlin `AppWidgetProvider` (next step).
- **Auto-update** — needs a release/signing pipeline.

## Build the APK
Unchanged — push to GitHub and the Actions workflow builds it, or build locally.
`npm install` now also pulls the notifications plugin; `npx cap sync android`
wires it in. (See the main README.)

> After building, replace `nova.apk` on your Vercel download site with the new one.
