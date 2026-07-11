-- ============================================================================
-- Cinema Machine — app config (admin-editable global settings)
--
-- A tiny key/value store for platform-wide config that an ADMIN edits in-app and
-- EVERY visitor (including signed-out ones on the landing page) reads. Today it
-- holds "plans-copy": the marketing copy (name, blurb, feature bullets, the
-- "most popular" flag) for the plan cards. Price and credits are NOT here — those
-- are owned by Stripe (the product price + plan_credits metadata) so the card can
-- never misrepresent the real charge/grant.
--
-- Run once in the Supabase SQL editor.
-- ============================================================================
create table if not exists public.turn_app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.turn_app_config enable row level security;

-- READ is public — the plan cards show on the signed-out landing page, so even the
-- anon key must be able to read this config.
drop policy if exists "app_config_read" on public.turn_app_config;
create policy "app_config_read" on public.turn_app_config
  for select using (true);

-- WRITE is admin-only (the demo/owner account). Everyone else is read-only.
drop policy if exists "app_config_admin_write" on public.turn_app_config;
create policy "app_config_admin_write" on public.turn_app_config
  for all
  using      (auth.jwt() ->> 'email' = 'admin@infinitestudioai.com')
  with check (auth.jwt() ->> 'email' = 'admin@infinitestudioai.com');
