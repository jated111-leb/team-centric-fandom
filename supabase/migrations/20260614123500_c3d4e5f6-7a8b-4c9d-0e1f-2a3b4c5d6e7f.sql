-- Schedule the Braze analytics syncs so the dashboards aren't dependent on a
-- manual "Refresh from Braze" click.
--   sync-wc-canvas-analytics  → /canvas/data_series (WC pre-game canvas)
--                               + /campaigns/data_series (WC congrats campaign)
--   sync-campaign-analytics   → /campaigns/data_series (league congrats campaign)
-- Both pull daily aggregates, so a few-hourly cadence keeps numbers fresh.
--
-- Auth differs per function:
--   sync-wc-canvas-analytics authorizes on the x-cron-secret header,
--   sync-campaign-analytics authorizes on Authorization: Bearer <CRON_SECRET>.
DO $$
DECLARE
  v_secret TEXT;
  v_cron_headers   TEXT;
  v_bearer_headers TEXT;
BEGIN
  SELECT value INTO v_secret FROM public.system_config WHERE key = 'CRON_SECRET';
  IF v_secret IS NULL THEN RETURN; END IF;
  v_cron_headers   := format('{"Content-Type":"application/json","x-cron-secret":"%s"}', v_secret);
  v_bearer_headers := format('{"Content-Type":"application/json","Authorization":"Bearer %s"}', v_secret);

  BEGIN PERFORM cron.unschedule('sync-wc-canvas-analytics-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule('sync-campaign-analytics-auto'); EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM cron.schedule('sync-wc-canvas-analytics-auto', '0 */3 * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/sync-wc-canvas-analytics', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_cron_headers));

  PERFORM cron.schedule('sync-campaign-analytics-auto', '0 */3 * * *',
    format($q$SELECT net.http_post(url:='https://howqpclucdljsovsjnrz.supabase.co/functions/v1/sync-campaign-analytics', headers:=%L::jsonb, body:='{}'::jsonb) AS request_id;$q$, v_bearer_headers));
END $$;
