SELECT cron.schedule(
  'braze-congrats-auto',
  '5,20,35,50 * * * *',
  $$SELECT net.http_post(
    url := 'https://howqpclucdljsovsjnrz.supabase.co/functions/v1/braze-congrats',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);