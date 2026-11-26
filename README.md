# Nova — one repo, two builds, Supabase accounts

```
mobile/     Android app (Capacitor)   -> builds Nova.apk
desktop/    Windows app (Electron)     -> builds Nova-Setup.exe
.github/workflows/build.yml  builds BOTH and publishes a GitHub Release
connect-supabase.bat         bakes your Supabase keys in, then pushes
nova-supabase.sql            run once in your Supabase project
```

## 1. Connect Supabase (accounts)
Double-click **`connect-supabase.bat`**. It asks for your Supabase **Project URL**
and **anon public key** (Project Settings → API), writes them into the app, opens
the SQL to run, and pushes to GitHub (which rebuilds).

One-time in Supabase:
- **SQL Editor** → paste **`nova-supabase.sql`** → **Run** (creates the `profiles`
  table with Row Level Security — each user sees only their own data).
- **Authentication → Providers → Email** → for smooth sign-up, turn **Confirm
  email OFF** (or leave on; the app shows a "check your email" step).

## 2. How accounts work
- **Email + password = identity** (Supabase Auth). Entered once per device.
- **PIN = daily unlock.** Set at sign-up, stored hashed in the account, so the
  **same PIN works on every device**.
- Sign up on one device → sign in on another with email+password → then just PIN.
- After **7 days of inactivity**, the app re-asks email+password, then PIN.
- **Switch account** is in More → Account.
- Each user's data lives in their own `profiles` row (RLS-protected).

> Status: the **mobile** app has the full account system. The **desktop** app
> currently keeps its encrypted pass-phrase "Cloud sync" and gets the identical
> account system next (so the mobile flow can be proven against your Supabase
> first). Both still build from this one repo.

## 3. Builds + downloads
Push (the bat does this) → repo **Actions** tab → one run builds the APK + EXE and
publishes them to a Release tagged **latest** as `Nova.apk` and `Nova-Setup.exe`.
The download website links straight to those release URLs (so the big exe never
touches Vercel's size limit).

## Run locally
- Desktop:  `cd desktop && npm install && npm start`
- Mobile:   `cd mobile  && npm install && npx cap run android`
