-- Schema for post-match congrats push notifications
-- Enables sending a congrats push to fans of the winning team 10-30 min after a match finishes

-- 1. Track congrats processing status on matches
ALTER TABLE matches ADD COLUMN IF NOT EXISTS congrats_status TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_congrats_pending ON matches(congrats_status) WHERE congrats_status = 'pending';

-- 2. Congrats dedup ledger (mirrors schedule_ledger pattern)
CREATE TABLE IF NOT EXISTS congrats_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  winning_team TEXT NOT NULL,
  losing_team TEXT NOT NULL,
  score_home INT NOT NULL,
  score_away INT NOT NULL,
  braze_dispatch_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id)
);

ALTER TABLE congrats_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view congrats ledger"
  ON congrats_ledger
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert congrats ledger"
  ON congrats_ledger
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Feature flag (disabled by default)
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES ('congrats_notifications_enabled', false, 'Enable post-match congrats push notifications for winning team fans')
ON CONFLICT (flag_name) DO NOTHING;

-- 4. Lock entry for concurrency control
INSERT INTO scheduler_locks (lock_name)
VALUES ('braze-congrats')
ON CONFLICT (lock_name) DO NOTHING;

-- 5. Notification type column to distinguish pre-match vs congrats
ALTER TABLE notification_sends ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'pre_match';
CREATE INDEX IF NOT EXISTS idx_notification_sends_type ON notification_sends(notification_type);
