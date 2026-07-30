-- ── pricing-watch daily schedule (APPLIED LIVE on 2026-07-30) ────────────────
--
-- Catches fal.ai price drift even when nobody opens the app: pg_cron + pg_net
-- call the pricing-watch Edge Function once a day. The function's scheduled
-- path (x-cron-secret header) runs the same fail-safe parser and PERSISTS the
-- result to turn_app_config key "pricing-watch-last" (service-role write).
-- The admin's browser reads that record on next visit (app/pricing-watch.jsx)
-- and shows the drift card — applying prices remains a reviewed admin click,
-- never automatic.
--
-- Secrets involved (NOT in this file):
--   • Edge Function secret PRICING_WATCH_CRON_SECRET — shared secret the
--     scheduled caller must present (set via Management API / dashboard).
--   • Vault secrets 'pricing_watch_anon_key' (project anon key, used as
--     Bearer so the gateway's JWT verification passes) and
--     'pricing_watch_cron_secret' (same value as the function secret).
--
-- To rotate: update BOTH the function secret and the vault secret
-- (vault.update_secret), then redeploy is NOT needed — the function reads the
-- env at request time after a secrets update restarts it.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- one-time (or rotation): store the two values in Vault
-- select vault.create_secret('<anon key>',   'pricing_watch_anon_key');
-- select vault.create_secret('<cron secret>','pricing_watch_cron_secret');

-- daily at 06:17 UTC (odd minute to avoid top-of-hour load)
select cron.unschedule(jobid) from cron.job where jobname = 'pricing-watch-daily';
select cron.schedule('pricing-watch-daily', '17 6 * * *', $job$
  select net.http_post(
    url := 'https://vubenblfdzginlqiglzw.supabase.co/functions/v1/pricing-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pricing_watch_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'pricing_watch_anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pricing_watch_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

-- inspect:  select jobid, jobname, schedule, active from cron.job;
-- history:  select status, return_message, start_time from cron.job_run_details
--           where jobid = (select jobid from cron.job where jobname='pricing-watch-daily')
--           order by start_time desc limit 5;
-- result:   select value->>'checkedAt', value->>'via' from turn_app_config
--           where key = 'pricing-watch-last';
