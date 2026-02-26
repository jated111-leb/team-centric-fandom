
-- Create copilot_campaigns table
CREATE TABLE public.copilot_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  segment_filter jsonb,
  trigger_properties jsonb,
  braze_campaign_id text,
  braze_dispatch_id text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.copilot_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view copilot campaigns"
  ON public.copilot_campaigns FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert copilot campaigns"
  ON public.copilot_campaigns FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update copilot campaigns"
  ON public.copilot_campaigns FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create copilot_messages table
CREATE TABLE public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  role text NOT NULL,
  content text,
  tool_calls jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view copilot messages"
  ON public.copilot_messages FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert copilot messages"
  ON public.copilot_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert growth-copilot lock
INSERT INTO public.scheduler_locks (lock_name) VALUES ('growth-copilot');
