-- ============================================================================
-- TURN — Render-style storage  (paste the WHOLE contents of this file into the
-- Supabase SQL Editor and click Run — not the file name!)
--
-- Two tiers of saved render styles (the "lock a Surprise-me style" feature):
--   • turn_user_styles   — PERSONAL, private to each user, synced cross-device.
--   • turn_global_styles — admin-curated HOUSE styles every signed-in user sees.
-- Uses the existing `public` schema with `turn_`-prefixed tables. Safe to re-run.
-- ============================================================================

-- ── PERSONAL LOCKED STYLES ───────────────────────────────────────────────────
-- One row per (user, style). `render` holds the style's render block (the same
-- shape stored in the in-app CHAR_RENDER_STYLES registry). Private per user.
create table if not exists public.turn_user_styles (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users(id) on delete cascade,
  style_key   text not null,
  label       text not null default 'Locked style',
  render      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (owner, style_key)
);
create index if not exists turn_user_styles_owner_idx on public.turn_user_styles(owner);

-- ── GLOBAL (ADMIN-CURATED) HOUSE STYLES ──────────────────────────────────────
-- A small, bounded set every signed-in user can read and use. Only the admin
-- account may add/update/delete (curation gated by one curator → scales).
-- For bundled seed presets such as "photoreal", admin curation is represented
-- by a row with the same style_key and metadata inside render:
--   {"__hidden": true} removes/hides that preset for signed-in users.
--   {"__order": 3} stores its position in the curated platform list.
-- Admin-published styles store their normal render block plus "__order".
-- The app strips these "__*" metadata keys before using a render block in prompts.
create table if not exists public.turn_global_styles (
  id          uuid primary key default gen_random_uuid(),
  style_key   text not null unique,
  label       text not null default 'House style',
  render      jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.turn_user_styles   enable row level security;
alter table public.turn_global_styles enable row level security;

-- personal: a user only ever sees/touches their own rows
drop policy if exists "own user styles" on public.turn_user_styles;
create policy "own user styles" on public.turn_user_styles
  for all using (owner = auth.uid()) with check (owner = auth.uid());

-- global: every signed-in user can READ …
drop policy if exists "read global styles" on public.turn_global_styles;
create policy "read global styles" on public.turn_global_styles
  for select using (auth.role() = 'authenticated');

-- … but only the admin account can ADD / UPDATE / DELETE (email claim from JWT).
-- This RLS policy is the AUTHORITATIVE guard for admin-only global writes; the
-- in-app UI also hides the controls from non-admins (defense in depth).
drop policy if exists "admin writes global styles" on public.turn_global_styles;
create policy "admin writes global styles" on public.turn_global_styles
  for all using ((auth.jwt() ->> 'email') = 'admin@infinitestudioai.com')
  with check ((auth.jwt() ->> 'email') = 'admin@infinitestudioai.com');
