-- ============================================================================
-- TURN — Generation credits  (paste the WHOLE contents of this file into the
-- Supabase SQL Editor and click Run — not the file name!)
--
-- One balance row per user. The app reads it through the `turn_credit_balance`
-- RPC (app/cloud.jsx cloudGetCreditBalance) and decrements it after each video
-- render through `turn_spend_credit`. Images and text calls spend through
-- `turn_record_usage_event`, which also writes an append-only usage ledger.
-- Uses the existing `public` schema with a `turn_`-prefixed table. Safe to re-run.
--
-- NO FREE TIER (2026-07): new users start at 0 credits — a free grant is trivially
-- multi-accounted ("milk" farming). Credits arrive only from a paid Stripe plan
-- (turn_set_plan, called by the stripe-webhook edge function) or a credit pack
-- (turn_add_pack). The Stage/paywall gates generation until the balance covers it.
--
-- NOTE: this is server-side accounting for image/text via the image-proxy edge
-- function. Stage video still calls turn_spend_credit after a successful render.
-- ============================================================================

create extension if not exists pgcrypto;

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

-- Stripe webhook idempotency: one-off credit packs must never be added twice if
-- Stripe retries the same checkout.session.completed event.
create table if not exists public.turn_stripe_events (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);
alter table public.turn_stripe_events enable row level security;

-- Append-only spend ledger. This is deliberately boring: every successful paid
-- text/image generation records provider/model/task/credits and any provider
-- usage details the proxy can extract. Failed/blocked attempts may also be
-- recorded with zero spend for support/debugging.
create table if not exists public.turn_usage_events (
  id                uuid primary key default gen_random_uuid(),
  owner             uuid not null references auth.users(id) on delete cascade,
  kind              text not null default 'generation',
  provider          text,
  model             text,
  task              text,
  credits           integer not null default 0,
  status            text not null default 'succeeded',
  request_id        text,
  input_tokens      integer,
  output_tokens     integer,
  total_tokens      integer,
  provider_cost_usd numeric(12,6),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
alter table public.turn_usage_events enable row level security;

create index if not exists turn_usage_events_owner_created_idx
  on public.turn_usage_events(owner, created_at desc);
create index if not exists turn_usage_events_task_model_idx
  on public.turn_usage_events(task, model);

create table if not exists public.turn_stage_waitlist (
  owner      uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.turn_stage_waitlist enable row level security;

-- users can see (only) their own balance; writes go through the RPCs below
drop policy if exists "turn_credits_select_own" on public.turn_credits;
create policy "turn_credits_select_own" on public.turn_credits
  for select using (auth.uid() = owner);

drop policy if exists "turn_usage_events_select_own" on public.turn_usage_events;
create policy "turn_usage_events_select_own" on public.turn_usage_events
  for select using (auth.uid() = owner);

drop policy if exists "turn_stage_waitlist_select_own" on public.turn_stage_waitlist;
create policy "turn_stage_waitlist_select_own" on public.turn_stage_waitlist
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

-- ── SPEND + LEDGER: atomic server-side accounting for text/image proxy calls ─
-- The proxy calls this only AFTER a provider succeeds. If the user's balance no
-- longer covers the spend, the event is recorded as blocked and the balance is
-- left untouched.
create or replace function public.turn_record_usage_event(
    event_kind text default 'generation',
    provider_name text default null,
    model_name text default null,
    task_name text default null,
    credit_cost integer default 0,
    usage_status text default 'succeeded',
    request_key text default null,
    input_token_count integer default null,
    output_token_count integer default null,
    provider_cost numeric default null,
    usage_metadata jsonb default '{}'::jsonb)
returns table (remaining integer, plan text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  spend integer := greatest(0, coalesce(credit_cost, 0));
  status_clean text := lower(coalesce(nullif(trim(usage_status), ''), 'succeeded'));
  meta jsonb := coalesce(usage_metadata, '{}'::jsonb);
begin
  if uid is null then return; end if;

  insert into public.turn_credits(owner, remaining)
    values (uid, public.turn_credit_starter())
    on conflict (owner) do nothing;

  if status_clean = 'succeeded' and spend > 0 then
    update public.turn_credits c
      set remaining = c.remaining - spend,
          updated_at = now()
      where c.owner = uid and c.remaining >= spend;

    if not found then
      insert into public.turn_usage_events(
        owner, kind, provider, model, task, credits, status, request_id,
        input_tokens, output_tokens, total_tokens, provider_cost_usd, metadata)
      values (
        uid, coalesce(event_kind, 'generation'), provider_name, model_name, task_name,
        0, 'blocked', request_key, input_token_count, output_token_count,
        coalesce(input_token_count, 0) + coalesce(output_token_count, 0),
        provider_cost, meta || jsonb_build_object('reason', 'insufficient_credits', 'attempted_credits', spend));
      raise exception 'INSUFFICIENT_CREDITS';
    end if;
  end if;

  insert into public.turn_usage_events(
    owner, kind, provider, model, task, credits, status, request_id,
    input_tokens, output_tokens, total_tokens, provider_cost_usd, metadata)
  values (
    uid, coalesce(event_kind, 'generation'), provider_name, model_name, task_name,
    case when status_clean = 'succeeded' then spend else 0 end,
    status_clean, request_key, input_token_count, output_token_count,
    coalesce(input_token_count, 0) + coalesce(output_token_count, 0),
    provider_cost, meta);

  return query
    select c.remaining, c.plan from public.turn_credits c where c.owner = uid;
end $$;

-- ── STAGE WAITLIST: lightweight signup capture from the public homepage ─────
create or replace function public.turn_join_stage_waitlist()
returns table (joined boolean, email text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then return; end if;
  select au.email into user_email from auth.users au where au.id = uid limit 1;
  insert into public.turn_stage_waitlist(owner, email)
    values (uid, user_email)
    on conflict (owner) do update
      set email = coalesce(excluded.email, public.turn_stage_waitlist.email);
  return query select true, user_email;
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

-- Stripe one-off credit pack, applied exactly once per webhook event id.
create or replace function public.turn_apply_pack_once(
    event_id text, uid uuid, amount integer, event_type text default 'checkout.session.completed')
returns integer
language plpgsql security definer set search_path = public as $$
declare bal integer; inserted integer;
begin
  if event_id is null or length(trim(event_id)) = 0 then raise exception 'Missing Stripe event id'; end if;
  insert into public.turn_stripe_events(id, type)
    values (event_id, coalesce(event_type, 'checkout.session.completed'))
    on conflict (id) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    insert into public.turn_credits(owner, remaining) values (uid, greatest(0, coalesce(amount,0)))
      on conflict (owner) do update
        set remaining = public.turn_credits.remaining + greatest(0, coalesce(excluded.remaining,0)),
            updated_at = now();
  end if;

  select remaining into bal from public.turn_credits where owner = uid; return coalesce(bal, 0);
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
grant execute on function public.turn_record_usage_event(text,text,text,text,integer,text,text,integer,integer,numeric,jsonb) to authenticated;
grant execute on function public.turn_join_stage_waitlist() to authenticated;
-- webhook RPCs run under the service role (edge function) — no authenticated grant.
-- turn_grant_credits deliberately gets NO grant either — SQL-editor only.

-- ── LIVE BALANCE: stream row changes to the app ──────────────────────────────
-- The app subscribes to this table over Supabase realtime (app.jsx), so a grant
-- from the SQL editor or a spend on another device updates the readout with no
-- reload. Safe to re-run (duplicate adds are swallowed).
do $$ begin
  alter publication supabase_realtime add table public.turn_credits;
exception when duplicate_object or undefined_object then null; end $$;
