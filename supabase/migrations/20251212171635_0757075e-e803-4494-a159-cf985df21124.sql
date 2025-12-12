-- Enhanced analytics summary with additional stats for UI components
CREATE OR REPLACE FUNCTION public.compute_analytics_summary(
  p_start_date timestamp with time zone DEFAULT NULL,
  p_end_date timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_start_date timestamp with time zone;
  v_end_date timestamp with time zone;
  v_prev_start_date timestamp with time zone;
  v_prev_end_date timestamp with time zone;
  v_date_range_days integer;
BEGIN
  -- Default to last 30 days if no dates provided
  v_end_date := COALESCE(p_end_date, now());
  v_start_date := COALESCE(p_start_date, v_end_date - interval '30 days');
  
  -- Calculate previous period for week-over-week comparison
  v_date_range_days := EXTRACT(DAY FROM v_end_date - v_start_date)::integer;
  v_prev_end_date := v_start_date;
  v_prev_start_date := v_start_date - (v_end_date - v_start_date);

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
        'avgNotificationsPerUser', ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT external_user_id), 0), 2),
        'todayUsers', (
          SELECT COUNT(DISTINCT external_user_id)
          FROM notification_sends
          WHERE sent_at >= date_trunc('day', now())
            AND external_user_id IS NOT NULL
        ),
        'multiGameDayUsers', (
          SELECT COUNT(DISTINCT user_date) FROM (
            SELECT external_user_id || '_' || date_trunc('day', sent_at)::text as user_date
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND external_user_id IS NOT NULL
              AND match_id IS NOT NULL
            GROUP BY external_user_id, date_trunc('day', sent_at)
            HAVING COUNT(DISTINCT match_id) > 1
          ) multi_game
        )
      )
      FROM notification_sends
      WHERE sent_at BETWEEN v_start_date AND v_end_date
        AND external_user_id IS NOT NULL
    ),
    'periodComparison', (
      SELECT jsonb_build_object(
        'currentPeriodNotifications', (
          SELECT COUNT(*) FROM notification_sends 
          WHERE sent_at BETWEEN v_start_date AND v_end_date
        ),
        'previousPeriodNotifications', (
          SELECT COUNT(*) FROM notification_sends 
          WHERE sent_at BETWEEN v_prev_start_date AND v_prev_end_date
        ),
        'currentPeriodUsers', (
          SELECT COUNT(DISTINCT external_user_id) FROM notification_sends 
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND external_user_id IS NOT NULL
        ),
        'previousPeriodUsers', (
          SELECT COUNT(DISTINCT external_user_id) FROM notification_sends 
          WHERE sent_at BETWEEN v_prev_start_date AND v_prev_end_date
            AND external_user_id IS NOT NULL
        )
      )
    ),
    'frequencyDistribution', (
      SELECT jsonb_agg(jsonb_build_object('range', range, 'count', cnt) ORDER BY ord)
      FROM (
        SELECT 
          CASE 
            WHEN notification_count = 1 THEN '1'
            WHEN notification_count BETWEEN 2 AND 5 THEN '2-5'
            WHEN notification_count BETWEEN 6 AND 10 THEN '6-10'
            WHEN notification_count BETWEEN 11 AND 20 THEN '11-20'
            ELSE '21+'
          END as range,
          CASE 
            WHEN notification_count = 1 THEN 1
            WHEN notification_count BETWEEN 2 AND 5 THEN 2
            WHEN notification_count BETWEEN 6 AND 10 THEN 3
            WHEN notification_count BETWEEN 11 AND 20 THEN 4
            ELSE 5
          END as ord,
          COUNT(*) as cnt
        FROM (
          SELECT external_user_id, COUNT(*) as notification_count
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND external_user_id IS NOT NULL
          GROUP BY external_user_id
        ) user_counts
        GROUP BY range, ord
      ) freq
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
$function$;