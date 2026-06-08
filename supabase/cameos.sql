-- ============================================================================
-- TURN — Cameos (Increment B cloud sync). Paste the WHOLE file into the
-- Supabase SQL Editor → Run. Opt-in only: cameos live here ONLY when a user
-- ticks "Sync this cameo to the cloud". Face images go to the existing
-- private `turn-assets` bucket (run supabase/storage.sql first if you haven't).
--
-- A cameo = one character's locked likeness: an array of angle images
-- (front + optional ¾ left/right) plus provenance (consent, source, subject).
-- Row-level security scopes every row to its owner.
-- ============================================================================

create table if not exists public.turn_cameos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.turn_projects(id) on delete cascade,
  owner       uuid not null references auth.users(id)          on delete cascade,
  char_id     text not null,                 -- character id within the story doc
  angles      jsonb not null default '[]',   -- [{label, storage_path}]
  prov        jsonb not null default '{}',   -- {consent, source, subject, iso, date, w, h}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, char_id)
);

create index if not exists turn_cameos_project_idx on public.turn_cameos(project_id);

alter table public.turn_cameos enable row level security;

drop policy if exists "cameos read own"   on public.turn_cameos;
drop policy if exists "cameos write own"  on public.turn_cameos;
drop policy if exists "cameos update own" on public.turn_cameos;
drop policy if exists "cameos delete own" on public.turn_cameos;

create policy "cameos read own"   on public.turn_cameos for select using (auth.uid() = owner);
create policy "cameos write own"  on public.turn_cameos for insert with check (auth.uid() = owner);
create policy "cameos update own" on public.turn_cameos for update using (auth.uid() = owner);
create policy "cameos delete own" on public.turn_cameos for delete using (auth.uid() = owner);

-- keep updated_at fresh
create or replace function public.turn_cameos_touch() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists turn_cameos_touch on public.turn_cameos;
create trigger turn_cameos_touch before update on public.turn_cameos
  for each row execute function public.turn_cameos_touch();
