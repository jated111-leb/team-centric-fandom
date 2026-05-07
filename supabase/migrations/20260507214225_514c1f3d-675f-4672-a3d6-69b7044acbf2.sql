-- Partial unique index to enforce one active ledger row per (match, target team)
CREATE UNIQUE INDEX IF NOT EXISTS wc_schedule_ledger_active_unique
  ON public.wc_schedule_ledger (match_id, target_team_canonical)
  WHERE status IN ('queued','sent_to_braze','delivered');

-- Add correlation columns to wc_notification_sends for league-style webhook matching
ALTER TABLE public.wc_notification_sends
  ADD COLUMN IF NOT EXISTS canvas_id text,
  ADD COLUMN IF NOT EXISTS canvas_name text,
  ADD COLUMN IF NOT EXISTS canvas_step_name text,
  ADD COLUMN IF NOT EXISTS match_id uuid;

CREATE INDEX IF NOT EXISTS wc_notification_sends_match_id_idx
  ON public.wc_notification_sends (match_id);
CREATE INDEX IF NOT EXISTS wc_notification_sends_dispatch_idx
  ON public.wc_notification_sends (braze_dispatch_id);
CREATE INDEX IF NOT EXISTS wc_notification_sends_send_idx
  ON public.wc_notification_sends (braze_send_id);