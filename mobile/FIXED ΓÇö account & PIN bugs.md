# Nova mobile — account / PIN fixes

Fixes the "I created an account (PIN + email + password) but when I open the
app it says **PIN not configured** and I can't sign in with my email/password
even though it's correct."

## Root causes found & fixed

1. **PIN was lost when the cloud write failed.** `setPin` wrote to Supabase
   first and only cached the PIN on your device *if that write succeeded*. If
   the `profiles` table/RLS wasn't set up yet (or you were offline), the write
   threw, the error was swallowed, and the PIN was never saved anywhere → "PIN
   not configured", unlockable forever.
   → Now the PIN is cached on the device **first**, then synced. The device
   that set the PIN can always unlock, even before the database is set up.

2. **Lock screen always assumed 4 digits.** If you chose a 6-digit PIN, the
   unlock screen only accepted 4 and could never match → "wrong PIN".
   → The PIN length now travels with the account (encoded in the salt, no DB
   change needed); the lock asks for the right number of digits on every
   device.

3. **A profile-read error blocked sign-in.** After entering correct
   credentials, a failed profile read showed "Could not connect" and looked
   like a login failure.
   → Sign-in no longer depends on the profile read. Correct credentials always
   get you in; clearer messages tell apart "wrong password" vs "confirm your
   email" vs "database not set up".

4. **Sign-up with email-confirmation / no-session.** If Supabase returned no
   session on sign-up, the app got stuck.
   → It now tries an immediate sign-in; only if that genuinely needs email
   confirmation does it show the "check your email" screen.

5. **New-device sign-in re-ran the whole 15-step setup** (and could overwrite
   your synced data with defaults).
   → It now just asks for your PIN and pulls your data.

6. **"Change PIN" in Settings wrote to the wrong place** in account mode (local
   lock instead of the account), so it silently didn't take effect. Fixed.

7. **Account mode never auto-locked** on inactivity, and the Security screen
   said "No PIN set" even when one was. Fixed.

Also hardened token refresh so it never loses your identity.

## One thing to do on the Supabase side (for cross-device sync)
Run `nova-supabase.sql` in your project (SQL Editor) and turn **email
confirmation OFF** (Authentication → Providers → Email). The app now works on
the device you signed up on even if you haven't done this yet, but syncing to a
second device needs the table + policies in that script.
