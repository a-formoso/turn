-- ============================================================================
-- TURN — Generation credits  (paste the WHOLE contents of this file into the
-- Supabase SQL Editor and click Run — not the file name!)
--
-- One balance row per user. The app reads it through the `turn_credit_balance`
-- RPC (app/cloud.jsx cloudGetCreditBalance) and decrements it after each video
-- render through `turn_spend_credit`. Uses the existing `public` schema with a
-- `turn_`-prefixed table. Safe to re-run.
--
-- NO FREE TIER (2026-07): new users start at 0 credits — a free grant is trivially
-- multi-accounted ("milk" farming). Credits arrive only from a paid Stripe plan
-- (turn_set_plan, called by the stripe-webhook edge function) or a credit pack
-- (turn_add_pack). The Stage/paywall gates generation until the balance covers it.
--
-- NOTE: this is honest-client accounting for the UI readout ("N remaining").
-- Hard enforcement (blocking a render server-side at 0) belongs in the
-- image-proxy edge function; the Stage UI already disables Generate when the
-- known balance is below the render cost.
-- ============================================================================

-- ── BALANCES ─────────────────────────────────────────────────────────────────
create table if not exists public.turn_credits (
  owner       uuid primary key references auth.users(id) on delete cascade,
  remaining   integer not null default 0,
  plan        text not null default 'none',   -- 'none' = unsubscribed (paywalled)
  updated_at  timestamptz not null default now()
);

-- subscription state, written by the Stripe webhook (safe to re-run)
alter table public.turn_credits add column if not exists tier               text;
alter table public.turn_credits add column if not exists stripe_customer_id text;
alter table public.turn_credits add column if not exists stripe_sub_id      text;
alter table public.turn_credits add column if not exists renews_at          timestamptz;

alter table public.turn_credits enable row level security;

-- users can see (only) their own balance; writes go through the RPCs below
drop policy if exists "turn_credits_select_own" on public.turn_credits;
create policy "turn_credits_select_own" on public.turn_credits
  for select using (auth.uid() = owner);

-- starter balance for a user's first row — ZERO (no free tier; credits come from
-- a paid plan or pack). Kept as a function so a promo/trial amount is a one-line change.
create or replace function public.turn_credit_starter() returns integer
language sql immutable as $$ select 0 $$;

-- ── READ: the app's primary balance source ──────────────────────────────────
-- Creates the row with the starter balance on first call, then returns it.
create or replace function public.turn_credit_balance()
returns table (remaining integer, plan text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.turn_credits(owner, remaining)
    values (auth.uid(), public.turn_credit_starter())
    on conflict (owner) do nothing;
  return query
    select c.remaining, c.plan from public.turn_credits c where c.owner = auth.uid();
end $$;

-- ── SPEND: decrement after a successful render ───────────────────────────────
-- Clamps at 0 and returns the new balance. cost defaults to 1 generation credit.
create or replace function public.turn_spend_credit(cost integer default 1)
returns table (remaining integer, plan text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.turn_credits(owner, remaining)
    values (auth.uid(), public.turn_credit_starter())
    on conflict (owner) do nothing;
  update public.turn_credits c
    set remaining = greatest(0, c.remaining - greatest(1, coalesce(cost, 1))),
        updated_at = now()
    where c.owner = auth.uid();
  return query
    select c.remaining, c.plan from public.turn_credits c where c.owner = auth.uid();
end $$;

-- ── ADMIN: top up / set a user's balance by email ────────────────────────────
-- Run manually from the SQL editor, e.g.:
--   select public.turn_grant_credits('someone@example.com', 100);
create or replace function public.turn_grant_credits(user_email text, amount integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare uid uuid; new_balance integer;
begin
  select id into uid from auth.users where lower(email) = lower(user_email) limit 1;
  if uid is null then raise exception 'No user with email %', user_email; end if;
  insert into public.turn_credits(owner, remaining) values (uid, greatest(0, amount))
    on conflict (owner) do update
      set remaining = greatest(0, public.turn_credits.remaining + excluded.remaining),
          updated_at = now();
  select remaining into new_balance from public.turn_credits where owner = uid;
  return new_balance;
end $$;

-- ── STRIPE: set a user's plan + refill to the month's allowance ──────────────
-- Called by the `stripe-webhook` edge function (service role) on checkout and on
-- each monthly renewal (invoice.paid). Identifies the user by their Supabase uid,
-- which the checkout carries as client_reference_id. Renewal RESETS the balance to
-- the plan allowance (use-it-or-lose-it v1 — switch to a rollover cap later).
create or replace function public.turn_set_plan(
    uid uuid, new_tier text, monthly_credits integer,
    sub_id text default null, customer_id text default null, renews timestamptz default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare bal integer;
begin
  insert into public.turn_credits(owner, remaining, plan, tier, stripe_sub_id, stripe_customer_id, renews_at)
    values (uid, greatest(0, coalesce(monthly_credits,0)), new_tier, new_tier, sub_id, customer_id, renews)
    on conflict (owner) do update
      set remaining = greatest(0, coalesce(excluded.remaining,0)),   -- refill to allowance
          plan = excluded.plan, tier = excluded.tier,
          stripe_sub_id = coalesce(excluded.stripe_sub_id, public.turn_credits.stripe_sub_id),
          stripe_customer_id = coalesce(excluded.stripe_customer_id, public.turn_credits.stripe_customer_id),
          renews_at = excluded.renews_at, updated_at = now();
  select remaining into bal from public.turn_credits where owner = uid; return bal;
end $$;

-- one-off credit pack (over-plan top-up) — ADDS to the balance, keeps the plan
create or replace function public.turn_add_pack(uid uuid, amount integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare bal integer;
begin
  insert into public.turn_credits(owner, remaining) values (uid, greatest(0, coalesce(amount,0)))
    on conflict (owner) do update
      set remaining = public.turn_credits.remaining + greatest(0, coalesce(excluded.remaining,0)),
          updated_at = now();
  select remaining into bal from public.turn_credits where owner = uid; return bal;
end $$;

-- subscription ended (customer.subscription.deleted) — drop the plan, keep any
-- credits the user already paid for; no more refills happen.
create or replace function public.turn_end_plan(uid uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.turn_credits
    set plan='none', tier=null, stripe_sub_id=null, renews_at=null, updated_at=now()
    where owner = uid;
end $$;

grant execute on function public.turn_credit_balance() to authenticated;
grant execute on function public.turn_spend_credit(integer) to authenticated;
-- webhook RPCs run under the service role (edge function) — no authenticated grant.
-- turn_grant_credits deliberately gets NO grant either — SQL-editor only.

-- ── LIVE BALANCE: stream row changes to the app ──────────────────────────────
-- The app subscribes to this table over Supabase realtime (app.jsx), so a grant
-- from the SQL editor or a spend on another device updates the readout with no
-- reload. Safe to re-run (duplicate adds are swallowed).
do $$ begin
  alter publication supabase_realtime add table public.turn_credits;
exception when duplicate_object or undefined_object then null; end $$;
