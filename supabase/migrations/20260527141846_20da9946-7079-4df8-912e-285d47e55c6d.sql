
-- Add post-game tracking columns to wc_matches
ALTER TABLE public.wc_matches
  ADD COLUMN IF NOT EXISTS score_home INTEGER,
  ADD COLUMN IF NOT EXISTS score_away INTEGER,
  ADD COLUMN IF NOT EXISTS congrats_status TEXT;

CREATE INDEX IF NOT EXISTS idx_wc_matches_congrats_status
  ON public.wc_matches (congrats_status)
  WHERE congrats_status = 'pending';

-- New congrats ledger table for WC
CREATE TABLE IF NOT EXISTS public.wc_congrats_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL UNIQUE,
  winning_team_canonical TEXT NOT NULL,
  losing_team_canonical TEXT NOT NULL,
  score_home INTEGER NOT NULL,
  score_away INTEGER NOT NULL,
  braze_dispatch_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_congrats_ledger TO authenticated;
GRANT ALL ON public.wc_congrats_ledger TO service_role;

ALTER TABLE public.wc_congrats_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wc_congrats_ledger"
  ON public.wc_congrats_ledger
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add notification_type discriminator to wc_notification_sends for analytics parity
ALTER TABLE public.wc_notification_sends
  ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'pre_match';

-- Seed feature flag (default disabled) and scheduler lock
INSERT INTO public.wc_feature_flags (key, enabled, description)
VALUES ('wc_congrats_notifications_enabled', false, 'Enable post-match congrats push notifications for WC winning team fans')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.wc_scheduler_locks (lock_name)
VALUES ('braze-worldcup-congrats')
ON CONFLICT (lock_name) DO NOTHING;
