
-- 1. Track congrats processing status on matches
ALTER TABLE matches ADD COLUMN congrats_status TEXT DEFAULT NULL;
CREATE INDEX idx_matches_congrats_status ON matches(congrats_status) WHERE congrats_status = 'pending';

-- 2. Congrats dedup ledger
CREATE TABLE congrats_ledger (
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

-- RLS: service role only (edge functions use service role key)
CREATE POLICY "Admins can view congrats ledger" ON congrats_ledger
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert congrats ledger" ON congrats_ledger
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update congrats ledger" ON congrats_ledger
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Feature flag (disabled by default)
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES ('congrats_notifications_enabled', false, 'Enable post-match congrats push notifications for winning team fans')
ON CONFLICT (flag_name) DO NOTHING;

-- 4. Lock entry for concurrency control
INSERT INTO scheduler_locks (lock_name) VALUES ('braze-congrats')
ON CONFLICT (lock_name) DO NOTHING;

-- 5. Notification type on notification_sends (distinguish pre-match from congrats)
ALTER TABLE notification_sends ADD COLUMN notification_type TEXT DEFAULT 'pre_match';
