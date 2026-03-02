
-- Create campaign_analytics table for storing Braze campaign delivery data
CREATE TABLE public.campaign_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  notification_type text NOT NULL DEFAULT 'congrats',
  date date NOT NULL,
  unique_recipients integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  direct_opens integer NOT NULL DEFAULT 0,
  total_opens integer NOT NULL DEFAULT 0,
  bounces integer NOT NULL DEFAULT 0,
  body_clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  raw_data jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, date)
);

-- Enable RLS
ALTER TABLE public.campaign_analytics ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view campaign analytics"
  ON public.campaign_analytics FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert campaign analytics"
  ON public.campaign_analytics FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update campaign analytics"
  ON public.campaign_analytics FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete campaign analytics"
  ON public.campaign_analytics FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
