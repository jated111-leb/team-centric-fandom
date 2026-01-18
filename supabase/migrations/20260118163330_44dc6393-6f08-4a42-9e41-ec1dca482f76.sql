
-- Create a function to get match performance with proper aggregation
CREATE OR REPLACE FUNCTION public.get_match_performance(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM (
    SELECT 
      match_id as "matchId",
      COALESCE(home_team, 'N/A') as "homeTeam",
      COALESCE(away_team, 'N/A') as "awayTeam",
      COALESCE(competition, 'N/A') as "competition",
      MIN(sent_at::date)::text as "sentDate",
      COUNT(*) as "reach",
      COUNT(DISTINCT external_user_id) as "uniqueUsers",
      CASE 
        WHEN COUNT(*) > 0 THEN 
          ROUND((COUNT(CASE WHEN home_team IS NOT NULL AND away_team IS NOT NULL THEN 1 END)::numeric / COUNT(*)) * 100, 1)
        ELSE 0
      END as "correlationRate"
    FROM notification_sends
    WHERE match_id IS NOT NULL
      AND (p_start_date IS NULL OR sent_at >= p_start_date)
      AND sent_at <= p_end_date
    GROUP BY match_id, home_team, away_team, competition
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ) t;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;
