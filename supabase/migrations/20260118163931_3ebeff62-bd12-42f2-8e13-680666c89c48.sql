
-- Update compute_analytics_summary to filter teams by featured_teams
DROP FUNCTION IF EXISTS public.compute_analytics_summary(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE FUNCTION public.compute_analytics_summary(
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
  v_start_date TIMESTAMPTZ := COALESCE(p_start_date, NOW() - INTERVAL '30 days');
  v_end_date TIMESTAMPTZ := p_end_date;
  v_prev_start_date TIMESTAMPTZ;
  v_prev_end_date TIMESTAMPTZ;
  v_period_days INT;
BEGIN
  -- Calculate period for comparison
  v_period_days := EXTRACT(EPOCH FROM (v_end_date - v_start_date)) / 86400;
  v_prev_end_date := v_start_date;
  v_prev_start_date := v_prev_end_date - (v_period_days || ' days')::INTERVAL;

  SELECT json_build_object(
    'userStats', (
      SELECT json_build_object(
        'totalUsers', COUNT(DISTINCT external_user_id),
        'usersWithMultiple', COUNT(*) FILTER (WHERE cnt > 1),
        'totalNotifications', SUM(cnt),
        'avgNotificationsPerUser', ROUND(AVG(cnt)::numeric, 2),
        'todayUsers', (
          SELECT COUNT(DISTINCT external_user_id)
          FROM notification_sends
          WHERE sent_at::date = CURRENT_DATE
        ),
        'multiGameDayUsers', (
          SELECT COUNT(DISTINCT external_user_id)
          FROM (
            SELECT external_user_id, sent_at::date as send_date, COUNT(DISTINCT match_id) as match_count
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND match_id IS NOT NULL
            GROUP BY external_user_id, sent_at::date
            HAVING COUNT(DISTINCT match_id) > 1
          ) multi_game
        )
      )
      FROM (
        SELECT external_user_id, COUNT(*) as cnt
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
        GROUP BY external_user_id
      ) user_counts
    ),
    'periodComparison', json_build_object(
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
      ),
      'previousPeriodUsers', (
        SELECT COUNT(DISTINCT external_user_id) FROM notification_sends 
        WHERE sent_at BETWEEN v_prev_start_date AND v_prev_end_date
      )
    ),
    'frequencyDistribution', (
      SELECT COALESCE(json_agg(json_build_object('range', range, 'count', count)), '[]'::json)
      FROM (
        SELECT 
          CASE 
            WHEN cnt = 1 THEN '1 notification'
            WHEN cnt BETWEEN 2 AND 5 THEN '2-5 notifications'
            WHEN cnt BETWEEN 6 AND 10 THEN '6-10 notifications'
            ELSE '10+ notifications'
          END as range,
          COUNT(*) as count
        FROM (
          SELECT external_user_id, COUNT(*) as cnt
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
          GROUP BY external_user_id
        ) user_counts
        GROUP BY 
          CASE 
            WHEN cnt = 1 THEN '1 notification'
            WHEN cnt BETWEEN 2 AND 5 THEN '2-5 notifications'
            WHEN cnt BETWEEN 6 AND 10 THEN '6-10 notifications'
            ELSE '10+ notifications'
          END
        ORDER BY MIN(cnt)
      ) freq
    ),
    'deliveryStats', json_build_object(
      'correlationRate', (
        SELECT ROUND(
          (COUNT(*) FILTER (WHERE match_id IS NOT NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 
          2
        )
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
      ),
      'naRate', (
        SELECT ROUND(
          (COUNT(*) FILTER (WHERE home_team IS NULL OR away_team IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 
          2
        )
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
      ),
      'totalSent', (
        SELECT COUNT(*) FROM notification_sends 
        WHERE sent_at BETWEEN v_start_date AND v_end_date
      ),
      'hourlyDistribution', (
        SELECT COALESCE(json_agg(json_build_object('hour', hour, 'count', count)), '[]'::json)
        FROM (
          SELECT EXTRACT(HOUR FROM sent_at) as hour, COUNT(*) as count
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
          GROUP BY EXTRACT(HOUR FROM sent_at)
          ORDER BY hour
        ) hourly
      )
    ),
    'contentStats', json_build_object(
      'byTeam', (
        -- Only include teams from featured_teams table (targeting criteria)
        SELECT COALESCE(json_agg(json_build_object('team', team, 'count', notifications, 'uniqueUsers', unique_users)), '[]'::json)
        FROM (
          SELECT 
            team,
            SUM(cnt) as notifications,
            COUNT(DISTINCT external_user_id) as unique_users
          FROM (
            SELECT home_team as team, external_user_id, COUNT(*) as cnt
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND home_team IS NOT NULL
              AND home_team IN (SELECT team_name FROM featured_teams)
            GROUP BY home_team, external_user_id
            UNION ALL
            SELECT away_team as team, external_user_id, COUNT(*) as cnt
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND away_team IS NOT NULL
              AND away_team IN (SELECT team_name FROM featured_teams)
            GROUP BY away_team, external_user_id
          ) team_data
          GROUP BY team
          ORDER BY unique_users DESC
          LIMIT 15
        ) top_teams
      ),
      'byCompetition', (
        SELECT COALESCE(json_agg(json_build_object('competition', competition, 'count', notifications, 'uniqueUsers', unique_users)), '[]'::json)
        FROM (
          SELECT 
            competition,
            COUNT(*) as notifications,
            COUNT(DISTINCT external_user_id) as unique_users
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND competition IS NOT NULL
          GROUP BY competition
          ORDER BY unique_users DESC
        ) comp_stats
      )
    ),
    'duplicates', json_build_object(
      'count', (
        SELECT COALESCE(SUM(cnt - 1), 0)
        FROM (
          SELECT external_user_id, match_id, COUNT(*) as cnt
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND match_id IS NOT NULL
          GROUP BY external_user_id, match_id
          HAVING COUNT(*) > 1
        ) dupes
      ),
      'affectedUsers', (
        SELECT COUNT(DISTINCT external_user_id)
        FROM (
          SELECT external_user_id, match_id, COUNT(*) as cnt
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND match_id IS NOT NULL
          GROUP BY external_user_id, match_id
          HAVING COUNT(*) > 1
        ) dupes
      )
    ),
    'dateRange', json_build_object(
      'start', v_start_date,
      'end', v_end_date
    )
  ) INTO result;

  RETURN result;
END;
$$;
