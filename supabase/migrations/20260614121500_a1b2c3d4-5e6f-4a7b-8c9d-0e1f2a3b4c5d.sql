-- Schedule braze-worldcup-congrats on its own cron.
-- Previously it only ran when sync-worldcup-data chain-invoked it (hourly),
-- so a failed chain call or a skipped run delayed post-match congrats by up to
-- an hour. Give it an independent 15-minute cadence (parity with the league
-- braze-congrats job) as a safety net.
DO $$
DECLARE
  v_secret TEXT;
  v_headers TEXT;
BEGIN
  SELECT value INTO v_secret FROM public.system_config WHERE key = 'CRON_SECRET';
  IF v_secret IS NULL THEN RETURN; END IF;
  v_headers := format('{"Content-Type":"application/json","x-cron-secret":"%s"}', v_secret);

  BEGIN PERFORM cron.unschedule('braze-worldcup-congrats-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule('braze-worldcup-congrats-auto', '*/15 * * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/braze-worldcup-congrats', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
END $$;
