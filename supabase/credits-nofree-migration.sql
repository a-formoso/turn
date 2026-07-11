-- TURN — "no free tier" migration for an ALREADY-DEPLOYED turn_credits table
-- ---------------------------------------------------------------------------
-- Older deploys created rows with plan 'free' and/or a starter credit grant, so
-- brand-new accounts came back entitled ("free plan") and could generate. The
-- current credits.sql already defaults new rows to plan 'none' / 0 credits, but
-- `create table if not exists` never changes an existing table's column defaults
-- and never rewrites existing rows. Run THIS once in the Supabase SQL editor to
-- bring a live database in line. Safe to run more than once (idempotent).

-- 1) Column defaults → the paywalled baseline.
alter table public.turn_credits alter column plan      set default 'none';
alter table public.turn_credits alter column remaining set default 0;

-- 2) The starter grant is ZERO (belt & braces if an old function returned >0).
create or replace function public.turn_credit_starter() returns integer
  language sql immutable as $$ select 0 $$;

-- 3) Demote every legacy free-tier row to unentitled. This ONLY touches rows whose
--    plan is 'free' or '' (the free-signup default) — it never zeroes a paid plan
--    (writer/director/studio) or a cancelled subscriber's leftover PAID credits
--    (those carry plan 'none' with remaining > 0 and are intentionally left alone).
update public.turn_credits
   set plan = 'none', remaining = 0
 where lower(coalesce(plan, '')) in ('free', '');

-- Verify: brand-new / free-farmed accounts should now read plan 'none', 0 credits.
-- select owner, plan, remaining from public.turn_credits order by updated_at desc limit 20;
