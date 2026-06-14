DO $$
DECLARE
  v_secret TEXT;
  v_headers TEXT;
BEGIN
  SELECT value INTO v_secret FROM public.system_config WHERE key = 'CRON_SECRET';
  IF v_secret IS NULL THEN RETURN; END IF;
  v_headers := format('{"Content-Type":"application/json","x-cron-secret":"%s"}', v_secret);

  BEGIN PERFORM cron.unschedule('sync-worldcup-data-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule('sync-worldcup-data-auto', '0 * * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/sync-worldcup-data', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
END $$;