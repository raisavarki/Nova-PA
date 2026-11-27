# Nova v8.6 — one account, phone + computer, synced

## What you asked for
Sign in on the **computer** exactly like the phone, and keep both in sync.

## How it works now
- **Same account, same PIN, both devices.** The computer app now has the same
  email+password sign-in and the same PIN unlock as the phone. Create the
  account on either device; sign in on the other with the same email, then
  unlock with the same PIN. (Verified: the phone and computer compute the
  identical PIN hash, so a PIN set on one unlocks the other.)
- **Two-way sync, always on.** Tasks, reminders, notes, habits, reading list,
  checklists, countdowns, expenses and journal stay in sync both ways. Each app
  pulls updates every ~20 seconds (and the moment it comes back to the front),
  and pushes a couple of seconds after any change. Edit on your phone → it shows
  up on the computer within ~20s, and vice-versa.
- **Works offline.** The PIN unlock is checked locally, so you get in even with
  no internet; changes sync next time you're online.
- The computer's old pass-phrase "Cloud sync" card is now hidden once you're on
  an account (the account replaces it).

## Setup (same Supabase project for both)
Run `setup-nova.bat` → step 1 now writes the config for **both** apps
(`mobile/www/supabase-config.js` and `desktop/src/supabase-config.json`), so the
computer and phone point to the same Supabase project automatically. Then build
and sign in on each.

Or, on the computer without rebuilding: **Settings → Account & sync**, paste the
same Supabase URL + anon key, and sign in.

## Honest limits (single-user, personal scale)
- Sync is **whole-document last-write-wins**: if you edit the *same* data on both
  devices within the same ~20-second window, the later save wins and the other
  change is dropped. In normal use (one device at a time) they just converge.
- Computer-only features (SAP launcher, clipboard, shortcuts, documents, widgets,
  meetings) stay local — the phone doesn't have them.
- Please test once against your live Supabase with a real phone + PC — the
  cross-device round-trip can't be exercised in the build sandbox. The account
  logic, PIN parity and data round-trip were unit-tested and pass.
