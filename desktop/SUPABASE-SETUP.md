# Nova — cloud sync with Supabase (phone + computer)

Nova can keep this computer and your phone in sync through **your own** free
Supabase project. Your data is **end-to-end encrypted on the device** with a
pass-phrase before it's uploaded, so Supabase only ever stores ciphertext.

## 1. Create the project (2 min)
1. Go to **https://supabase.com** → sign in → **New project**. Pick any name,
   a region near you, and a database password (you won't need it again).
2. Wait for it to finish provisioning.

## 2. Create the sync table
Open **SQL Editor** → **New query**, paste this, and click **Run**:

```sql
create table if not exists public.nova_sync (
  id         text primary key,
  app        text,
  cipher     text not null,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.nova_sync enable row level security;

-- Data is end-to-end encrypted by Nova, so the anon key may read/write rows.
create policy "nova anon read"  on public.nova_sync for select using (true);
create policy "nova anon write" on public.nova_sync for insert with check (true);
create policy "nova anon update" on public.nova_sync for update using (true) with check (true);
```

## 3. Get your keys
**Project Settings → API**, copy:
- **Project URL** — `https://xxxx.supabase.co`
- **anon public** key — the long `eyJ…` string.

## 4. Connect Nova
On **each device** (computer: Settings → ☁️ Cloud sync; phone: More → ☁️ Cloud
sync), enter:
- the **Project URL** and **anon public** key,
- an **Account name** — any word, but the **same on every device** (e.g. `raisa-nova`),
- a **Pass-phrase** — this encrypts your data. Use the **same** one everywhere.
  It never leaves the device.

Tap **Connect & sync**. From then on Nova syncs on launch, after changes, and
when you tap **Sync now**. Newest change wins.

## How it stays private
- Everything is encrypted with AES-256-GCM using a key derived from your
  pass-phrase (PBKDF2, 150k iterations). Supabase stores only the ciphertext.
- Keep the **same account name + pass-phrase** on every device, or they won't
  see each other's data. There's no password reset — if you forget the
  pass-phrase, the cloud copy can't be decrypted (your on-device data is still
  fine).

## A note on the two apps
The phone app and the computer app store some different things (the computer
also has people, money, journal, SAP, etc.). Cloud sync carries the data each
app understands. For the shared essentials — tasks, reminders, notes, habits,
focus — both stay in sync. App-specific extras stay on their own device.

## Harden it later (optional)
The policies above let anyone with your anon key write rows (the content is
still encrypted and useless without your pass-phrase). For stronger control,
turn on Supabase **Auth** and scope the policies to `auth.uid()`, or put the
table behind an Edge Function. Ask and I'll wire that up.
