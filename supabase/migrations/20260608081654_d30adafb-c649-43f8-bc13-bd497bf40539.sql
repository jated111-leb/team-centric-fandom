
CREATE TABLE public.wc_canvas_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date date NOT NULL,
  braze_object_id text NOT NULL,
  object_type text NOT NULL CHECK (object_type IN ('canvas','campaign')),
  name text,
  entries integer NOT NULL DEFAULT 0,
  unique_recipients integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  total_opens integer NOT NULL DEFAULT 0,
  direct_opens integer NOT NULL DEFAULT 0,
  bounces integer NOT NULL DEFAULT 0,
  body_clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  step_breakdown jsonb,
  variant_breakdown jsonb,
  raw_payload jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stat_date, braze_object_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wc_canvas_daily_stats TO authenticated;
GRANT ALL ON public.wc_canvas_daily_stats TO service_role;

ALTER TABLE public.wc_canvas_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage wc_canvas_daily_stats"
  ON public.wc_canvas_daily_stats
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX wc_canvas_daily_stats_date_idx ON public.wc_canvas_daily_stats (stat_date DESC);
CREATE INDEX wc_canvas_daily_stats_object_idx ON public.wc_canvas_daily_stats (braze_object_id);
