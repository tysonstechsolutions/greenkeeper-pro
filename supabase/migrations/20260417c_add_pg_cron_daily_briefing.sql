-- Schedules the daily-briefing edge function via pg_cron + pg_net.
--
-- Why this exists: Phase 2 of the Capacitor migration deletes the Next.js
-- server, so /api/cron/* routes no longer exist. The morning briefing has
-- to be triggered by something inside Supabase. The cleanest answer is
-- pg_cron (already shipped with Supabase) calling pg_net.http_post against
-- the deployed daily-briefing function.
--
-- ─── Setup checklist (DO BEFORE APPLYING THIS MIGRATION) ─────────────────
--   1. supabase secrets set DAILY_BRIEFING_SECRET=<random-32-byte-hex>
--   2. supabase functions deploy daily-briefing
--   3. In the Supabase dashboard → SQL editor, set the same secret as a DB-
--      level Vault secret so this migration can read it without hardcoding:
--        select vault.create_secret('<same value as above>', 'daily_briefing_secret');
--      (Or replace the lookup below with a hardcoded literal — less safe but
--       fine for single-tenant deployments.)
--   4. Replace PROJECT_URL below with your project's functions URL:
--        https://<project-ref>.supabase.co
--      (Supabase hosted Postgres disallows `ALTER DATABASE ... SET app.*`,
--       so the URL must be hardcoded here. This migration is already
--       project-specific because of the secret lookup, so hardcoding the
--       URL doesn't reduce portability.)
--
-- ─── What this migration does ────────────────────────────────────────────
--   * Enables pg_cron + pg_net (no-op if already enabled).
--   * Drops any prior schedule with the same name (idempotent).
--   * Schedules daily_briefing to run at 05:00 UTC every day.
--     Adjust the cron expression for your local timezone — Supabase pg_cron
--     runs in UTC. Naval Station Great Lakes is America/Chicago (UTC-6 CST,
--     UTC-5 CDT), so 05:00 local = 10:00 or 11:00 UTC depending on DST.
--     The default below uses 11:00 UTC which is 05:00 CST / 06:00 CDT.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Idempotent: drop any existing job with the same name before recreating.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily_briefing') then
    perform cron.unschedule('daily_briefing');
  end if;
end
$$;

-- Schedule: 11:00 UTC daily (~05:00 CST / 06:00 CDT at NSGL).
-- pg_cron syntax: minute hour day-of-month month day-of-week
select cron.schedule(
  'daily_briefing',
  '0 11 * * *',
  $cron$
    select net.http_post(
      url := 'https://mbgublyqnyghmvqfooao.supabase.co/functions/v1/daily-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', concat(
          'Bearer ',
          (select decrypted_secret from vault.decrypted_secrets where name = 'daily_briefing_secret' limit 1)
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $cron$
);

-- ─── Operational helpers ────────────────────────────────────────────────
-- View scheduled jobs:
--   select jobid, jobname, schedule, active from cron.job;
--
-- View recent runs (success/failure, return value, start/end times):
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'daily_briefing')
--   order by start_time desc limit 20;
--
-- Manually trigger the function for testing:
--   select net.http_post(
--     url := 'https://<project-ref>.functions.supabase.co/daily-briefing?preview=true',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <your DAILY_BRIEFING_SECRET>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--
-- Disable temporarily:
--   update cron.job set active = false where jobname = 'daily_briefing';
--
-- Remove permanently:
--   select cron.unschedule('daily_briefing');
