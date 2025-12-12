-- Create analytics cache table for storing pre-computed statistics
CREATE TABLE public.analytics_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stat_type text NOT NULL,
  stat_value jsonb NOT NULL,
  date_range_start timestamp with time zone,
  date_range_end timestamp with time zone,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create unique index for stat_type + date range combination
CREATE UNIQUE INDEX idx_analytics_cache_stat_type_dates ON public.analytics_cache (stat_type, date_range_start, date_range_end);

-- Enable RLS
ALTER TABLE public.analytics_cache ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage analytics cache
CREATE POLICY "Admins can view analytics cache"
ON public.analytics_cache FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert analytics cache"
ON public.analytics_cache FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update analytics cache"
ON public.analytics_cache FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete analytics cache"
ON public.analytics_cache FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to compute analytics summary (runs server-side, returns aggregated data)
CREATE OR REPLACE FUNCTION public.compute_analytics_summary(
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_start_date timestamp with time zone;
  v_end_date timestamp with time zone;
BEGIN
  -- Default to last 30 days if no dates provided
  v_end_date := COALESCE(p_end_date, now());
  v_start_date := COALESCE(p_start_date, v_end_date - interval '30 days');

  SELECT jsonb_build_object(
    'userStats', (
      SELECT jsonb_build_object(
        'totalUsers', COUNT(DISTINCT external_user_id),
        'usersWithMultiple', (
          SELECT COUNT(*) FROM (
            SELECT external_user_id 
            FROM notification_sends 
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND external_user_id IS NOT NULL
            GROUP BY external_user_id 
            HAVING COUNT(*) > 1
          ) sub
        ),
        'totalNotifications', COUNT(*),
        'avgNotificationsPerUser', ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT external_user_id), 0), 2)
      )
      FROM notification_sends
      WHERE sent_at BETWEEN v_start_date AND v_end_date
        AND external_user_id IS NOT NULL
    ),
    'deliveryStats', (
      SELECT jsonb_build_object(
        'correlationRate', ROUND(
          (COUNT(*) FILTER (WHERE match_id IS NOT NULL AND kickoff_utc IS NOT NULL)::numeric / NULLIF(COUNT(*), 0) * 100), 
          1
        ),
        'naRate', ROUND(
          (COUNT(*) FILTER (WHERE match_id IS NULL OR kickoff_utc IS NULL)::numeric / NULLIF(COUNT(*), 0) * 100), 
          1
        ),
        'totalSent', COUNT(*),
        'hourlyDistribution', (
          SELECT jsonb_agg(
            jsonb_build_object('hour', hour, 'count', cnt)
            ORDER BY hour
          )
          FROM (
            SELECT EXTRACT(HOUR FROM sent_at) as hour, COUNT(*) as cnt
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
            GROUP BY EXTRACT(HOUR FROM sent_at)
          ) hourly
        )
      )
      FROM notification_sends
      WHERE sent_at BETWEEN v_start_date AND v_end_date
    ),
    'contentStats', (
      SELECT jsonb_build_object(
        'byTeam', (
          SELECT jsonb_agg(
            jsonb_build_object('team', team, 'count', cnt)
            ORDER BY cnt DESC
          )
          FROM (
            SELECT home_team as team, COUNT(*) as cnt
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND home_team IS NOT NULL
            GROUP BY home_team
            ORDER BY cnt DESC
            LIMIT 10
          ) teams
        ),
        'byCompetition', (
          SELECT jsonb_agg(
            jsonb_build_object('competition', competition, 'count', cnt)
            ORDER BY cnt DESC
          )
          FROM (
            SELECT competition, COUNT(*) as cnt
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND competition IS NOT NULL
            GROUP BY competition
            ORDER BY cnt DESC
          ) comps
        )
      )
    ),
    'duplicates', (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'affectedUsers', COUNT(DISTINCT external_user_id)
      )
      FROM (
        SELECT external_user_id, match_id
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND external_user_id IS NOT NULL
          AND match_id IS NOT NULL
        GROUP BY external_user_id, match_id
        HAVING COUNT(*) > 1
      ) dups
    ),
    'dateRange', jsonb_build_object(
      'start', v_start_date,
      'end', v_end_date
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- Create function to get paginated notification details (for drill-down)
CREATE OR REPLACE FUNCTION public.get_notification_details(
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 100,
  p_filter_type text DEFAULT NULL,
  p_filter_value text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_start_date timestamp with time zone;
  v_end_date timestamp with time zone;
  v_offset integer;
BEGIN
  v_end_date := COALESCE(p_end_date, now());
  v_start_date := COALESCE(p_start_date, v_end_date - interval '30 days');
  v_offset := p_page * p_page_size;

  SELECT jsonb_build_object(
    'data', (
      SELECT jsonb_agg(row_to_json(n))
      FROM (
        SELECT id, external_user_id, match_id, home_team, away_team, 
               competition, sent_at, kickoff_utc, braze_event_type
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND (p_filter_type IS NULL OR 
               (p_filter_type = 'team' AND (home_team = p_filter_value OR away_team = p_filter_value)) OR
               (p_filter_type = 'competition' AND competition = p_filter_value) OR
               (p_filter_type = 'user' AND external_user_id = p_filter_value))
        ORDER BY sent_at DESC
        LIMIT p_page_size
        OFFSET v_offset
      ) n
    ),
    'totalCount', (
      SELECT COUNT(*)
      FROM notification_sends
      WHERE sent_at BETWEEN v_start_date AND v_end_date
        AND (p_filter_type IS NULL OR 
             (p_filter_type = 'team' AND (home_team = p_filter_value OR away_team = p_filter_value)) OR
             (p_filter_type = 'competition' AND competition = p_filter_value) OR
             (p_filter_type = 'user' AND external_user_id = p_filter_value))
    ),
    'page', p_page,
    'pageSize', p_page_size
  ) INTO result;

  RETURN result;
END;
$$;

-- Create indexes to optimize analytics queries
CREATE INDEX IF NOT EXISTS idx_notification_sends_sent_at ON public.notification_sends (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_sends_external_user_id ON public.notification_sends (external_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_sends_match_id ON public.notification_sends (match_id);
CREATE INDEX IF NOT EXISTS idx_notification_sends_home_team ON public.notification_sends (home_team);
CREATE INDEX IF NOT EXISTS idx_notification_sends_competition ON public.notification_sends (competition);