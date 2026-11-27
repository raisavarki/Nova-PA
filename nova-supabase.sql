-- ============================================================================
--  Nova — Supabase schema (accounts model)
--  Run this once in your Supabase project: SQL Editor → New query → paste → Run
-- ============================================================================

-- One row per user, keyed by their Supabase Auth id. Row Level Security makes
-- each user able to read/write ONLY their own row.
create table if not exists public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  pin_salt   text,
  pin_hash   text,                 -- PIN is hashed; the raw PIN is never stored
  data       jsonb,                -- the user's Nova data (tasks, reminders, …)
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- (Optional) the older pass-phrase sync table used by the desktop "Cloud sync"
-- card. Harmless to keep; the accounts model above does not need it.
create table if not exists public.nova_sync (
  id         text primary key,
  app        text,
  cipher     text not null,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.nova_sync enable row level security;
drop policy if exists "nova anon read"   on public.nova_sync;
drop policy if exists "nova anon write"  on public.nova_sync;
drop policy if exists "nova anon update" on public.nova_sync;
create policy "nova anon read"   on public.nova_sync for select using (true);
create policy "nova anon write"  on public.nova_sync for insert with check (true);
create policy "nova anon update" on public.nova_sync for update using (true) with check (true);
