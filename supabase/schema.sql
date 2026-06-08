-- ============================================================================
-- TURN — Supabase schema  (paste the WHOLE contents of this file into the
-- Supabase SQL Editor and click Run — not the file name!)
--
-- Uses your existing `public` schema with `turn_`-prefixed tables, so it stays
-- isolated by name and the Data API exposes it automatically (no "expose schema"
-- step needed). Safe to re-run.
-- ============================================================================

-- ── PROJECTS ────────────────────────────────────────────────────────────────
-- One row per film. `doc` holds the whole story document (scenes, characters,
-- props, drafts, beats, continuity) as JSON.
create table if not exists public.turn_projects (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Untitled film',
  doc         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists turn_projects_owner_idx on public.turn_projects(owner);

-- ── GENERATIONS ─────────────────────────────────────────────────────────────
-- One row per generated asset slot (character base sheet, prop sheet, or an
-- appearance-state variant). `entity_id` is the in-app slot id (e.g. 'neo',
-- 'neo:st-abc', 'prop-xyz'). The image BINARY lives in Storage; this row keeps
-- its path + metadata + reference list + version history.
create table if not exists public.turn_generations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.turn_projects(id) on delete cascade,
  owner         uuid not null references auth.users(id) on delete cascade,
  entity_id     text not null,
  storage_path  text,
  meta          jsonb not null default '{}'::jsonb,
  refs          jsonb not null default '[]'::jsonb,
  history       jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now(),
  unique (project_id, entity_id)
);
create index if not exists turn_generations_project_idx on public.turn_generations(project_id);

-- ── updated_at touch trigger ────────────────────────────────────────────────
create or replace function public.turn_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists turn_projects_touch on public.turn_projects;
create trigger turn_projects_touch before update on public.turn_projects
  for each row execute function public.turn_touch_updated_at();

drop trigger if exists turn_generations_touch on public.turn_generations;
create trigger turn_generations_touch before update on public.turn_generations
  for each row execute function public.turn_touch_updated_at();

-- ── Row Level Security: a user can only see/touch their own rows ─────────────
alter table public.turn_projects    enable row level security;
alter table public.turn_generations enable row level security;

drop policy if exists "own turn projects" on public.turn_projects;
create policy "own turn projects" on public.turn_projects
  for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "own turn generations" on public.turn_generations;
create policy "own turn generations" on public.turn_generations
  for all using (owner = auth.uid()) with check (owner = auth.uid());
