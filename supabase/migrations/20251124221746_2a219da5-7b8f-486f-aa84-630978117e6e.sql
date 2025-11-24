-- Create notification_sends table for tracking all sent notifications
CREATE TABLE public.notification_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Braze event data
  external_user_id text,
  braze_event_type text NOT NULL,
  
  -- Match/notification context
  match_id bigint REFERENCES public.matches(id) ON DELETE SET NULL,
  braze_schedule_id text,
  campaign_id text,
  
  -- Message details (from trigger properties)
  home_team text,
  away_team text,
  competition text,
  kickoff_utc timestamptz,
  
  -- Timing
  sent_at timestamptz NOT NULL,
  event_received_at timestamptz NOT NULL DEFAULT now(),
  
  -- Raw webhook payload for debugging
  raw_payload jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for quick lookups
CREATE INDEX idx_notification_sends_match ON public.notification_sends(match_id);
CREATE INDEX idx_notification_sends_user ON public.notification_sends(external_user_id);
CREATE INDEX idx_notification_sends_sent_at ON public.notification_sends(sent_at DESC);
CREATE INDEX idx_notification_sends_event_type ON public.notification_sends(braze_event_type);

-- Enable RLS
ALTER TABLE public.notification_sends ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can view notification sends
CREATE POLICY "Admins can view all notification sends"
  ON public.notification_sends
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert notification sends"
  ON public.notification_sends
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_sends;