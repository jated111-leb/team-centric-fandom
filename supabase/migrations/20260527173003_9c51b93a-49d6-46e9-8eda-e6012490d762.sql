DO $$
DECLARE
  v_secret TEXT;
  v_headers TEXT;
  v_job TEXT;
BEGIN
  SELECT value INTO v_secret FROM public.system_config WHERE key = 'CRON_SECRET';
  IF v_secret IS NULL THEN RETURN; END IF;
  v_headers := format('{"Content-Type":"application/json","x-cron-secret":"%s"}', v_secret);

  FOREACH v_job IN ARRAY ARRAY['sync-worldcup-data-auto','braze-worldcup-scheduler-auto','braze-worldcup-reconcile-auto','gap-detection-worldcup-auto','pre-send-verification-worldcup-auto']
  LOOP
    BEGIN PERFORM cron.unschedule(v_job); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  PERFORM cron.schedule('sync-worldcup-data-auto', '0 23 * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/sync-worldcup-data', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
  PERFORM cron.schedule('braze-worldcup-scheduler-auto', '*/15 * * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/braze-worldcup-scheduler', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
  PERFORM cron.schedule('braze-worldcup-reconcile-auto', '0 * * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/braze-worldcup-reconcile', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
  PERFORM cron.schedule('gap-detection-worldcup-auto', '30 * * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/gap-detection-worldcup', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
  PERFORM cron.schedule('pre-send-verification-worldcup-auto', '*/10 * * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/pre-send-verification-worldcup', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_headers));
END $$;