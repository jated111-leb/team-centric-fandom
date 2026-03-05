-- 1. game_reminders table
--    One row per (user, match) pair. The scheduler reads this to know who wants a reminder for what.
CREATE TABLE game_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_user_id TEXT NOT NULL,          -- Braze external user ID supplied by the mobile app
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reminder_status TEXT NOT NULL DEFAULT 'pending',
    -- pending   → not yet sent to Braze
    -- scheduled → Braze scheduled send exists (braze_schedule_id is populated)
    -- sent      → Braze delivered the notification (future webhook confirmation)
    -- cancelled → match finished/postponed, or send window missed
    -- error     → Braze API call failed
  braze_schedule_id TEXT,                  -- ID returned by Braze /campaigns/trigger/schedule/create
  scheduled_send_at TIMESTAMPTZ,          -- kickoff_utc - 30 min (last value we sent to Braze)
  kickoff_utc TIMESTAMPTZ,                -- Kickoff we last scheduled against (drift detection)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(external_user_id, match_id)      -- One reminder per user per match; upsert resets to pending
);

CREATE INDEX idx_game_reminders_status ON game_reminders(reminder_status)
  WHERE reminder_status IN ('pending', 'scheduled');
CREATE INDEX idx_game_reminders_match_id ON game_reminders(match_id);

ALTER TABLE game_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view game reminders" ON game_reminders
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert game reminders" ON game_reminders
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update game reminders" ON game_reminders
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Feature flag (enabled by default — disable in Supabase dashboard to pause reminders)
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES (
  'reminder_notifications_enabled',
  true,
  'Send Braze push notification 30 min before kickoff for users who tapped Remind Me'
)
ON CONFLICT (flag_name) DO NOTHING;

-- 3. Scheduler lock row for concurrency control
INSERT INTO scheduler_locks (lock_name) VALUES ('braze-reminder-scheduler')
ON CONFLICT (lock_name) DO NOTHING;

-- 4. pg_cron job: runs at :10/:25/:40/:55 (offset from existing crons at :00/:05/:15/:20/:35/:50)
SELECT cron.schedule(
  'braze-reminder-scheduler-auto',
  '10,25,40,55 * * * *',
  $$SELECT net.http_post(
    url := 'https://howqpclucdljsovsjnrz.supabase.co/functions/v1/braze-reminder-scheduler',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;$$
);
