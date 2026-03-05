-- Game reminder hardening: fix cron auth + index for stale cleanup
--
-- PREREQUISITE (run once as superuser before this migration):
--   The braze-reminder-scheduler cron reads the CRON_SECRET from the database
--   setting 'app.cron_secret'. This must match the CRON_SECRET Edge Function secret.
--
--   ALTER DATABASE postgres SET "app.cron_secret" = '<your_CRON_SECRET_value>';
--
-- Without this, the cron job will pass a NULL secret and the scheduler will reject
-- the call with 401 (falling back to requiring an admin JWT).

-- 1. Fix the cron job to pass cron_secret from the database setting at runtime.
--    current_setting('app.cron_secret', true) returns NULL (not an error) if unset.
SELECT cron.unschedule('braze-reminder-scheduler-auto');

SELECT cron.schedule(
  'braze-reminder-scheduler-auto',
  '10,25,40,55 * * * *',
  $$SELECT net.http_post(
    url := 'https://howqpclucdljsovsjnrz.supabase.co/functions/v1/braze-reminder-scheduler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := json_build_object(
      'cron_secret', current_setting('app.cron_secret', true)
    )::jsonb
  ) AS request_id;$$
);

-- 2. Index to make the stale cancelled row cleanup efficient.
--    The cleanup query filters: status = 'cancelled' AND updated_at < threshold.
--    The existing partial index only covers pending/scheduled rows, so we add this.
CREATE INDEX IF NOT EXISTS idx_game_reminders_cancelled_updated
  ON game_reminders(updated_at)
  WHERE reminder_status = 'cancelled';
