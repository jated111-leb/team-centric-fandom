-- Update compute_analytics_summary to include scheduler health metrics
CREATE OR REPLACE FUNCTION public.compute_analytics_summary(p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT now())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  v_start_date TIMESTAMPTZ := COALESCE(p_start_date, NOW() - INTERVAL '30 days');
  v_end_date TIMESTAMPTZ := p_end_date;
  v_prev_start_date TIMESTAMPTZ;
  v_prev_end_date TIMESTAMPTZ;
  v_period_days INT;
BEGIN
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
        SELECT COALESCE(json_agg(json_build_object(
          'competition', COALESCE(ct.english_name, ns.competition),
          'code', ns.competition,
          'count', ns.notifications,
          'uniqueUsers', ns.unique_users
        )), '[]'::json)
        FROM (
          SELECT 
            competition,
            COUNT(*) as notifications,
            COUNT(DISTINCT external_user_id) as unique_users
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND competition IS NOT NULL
          GROUP BY competition
          ORDER BY notifications DESC
        ) ns
        LEFT JOIN competition_translations ct ON ct.competition_code = ns.competition
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
    'schedulerHealth', json_build_object(
      'matchesWithMultipleDispatchIds', (
        SELECT COUNT(*)
        FROM (
          SELECT match_id
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND match_id IS NOT NULL
          GROUP BY match_id
          HAVING COUNT(DISTINCT raw_payload->>'dispatch_id') > 1
        ) anomalies
      ),
      'avgDispatchIdsPerMatch', (
        SELECT COALESCE(ROUND(AVG(dispatch_count)::numeric, 2), 0)
        FROM (
          SELECT match_id, COUNT(DISTINCT raw_payload->>'dispatch_id') as dispatch_count
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND match_id IS NOT NULL
          GROUP BY match_id
        ) counts
      ),
      'scheduleLedgerDuplicates', (
        SELECT COUNT(*)
        FROM (
          SELECT match_id
          FROM schedule_ledger
          WHERE created_at BETWEEN v_start_date AND v_end_date
          GROUP BY match_id
          HAVING COUNT(*) > 1
        ) dupes
      ),
      'webhookDuplicatesSkipped', (
        SELECT COALESCE(SUM((details->>'duplicates_skipped')::int), 0)
        FROM scheduler_logs
        WHERE function_name = 'braze-webhook'
          AND action = 'duplicates_skipped'
          AND created_at BETWEEN v_start_date AND v_end_date
      ),
      'topAnomalies', (
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          SELECT 
            ns.match_id as "matchId",
            ns.home_team as "homeTeam",
            ns.away_team as "awayTeam",
            COUNT(DISTINCT ns.raw_payload->>'dispatch_id') as "dispatchIdCount",
            COALESCE((
              SELECT COUNT(*) 
              FROM schedule_ledger sl 
              WHERE sl.match_id = ns.match_id
            ), 0) as "scheduleCount"
          FROM notification_sends ns
          WHERE ns.sent_at BETWEEN v_start_date AND v_end_date
            AND ns.match_id IS NOT NULL
          GROUP BY ns.match_id, ns.home_team, ns.away_team
          HAVING COUNT(DISTINCT ns.raw_payload->>'dispatch_id') > 1
             OR (SELECT COUNT(*) FROM schedule_ledger sl WHERE sl.match_id = ns.match_id) > 1
          ORDER BY COUNT(DISTINCT ns.raw_payload->>'dispatch_id') DESC
          LIMIT 10
        ) t
      )
    ),
    'dateRange', json_build_object(
      'start', v_start_date,
      'end', v_end_date
    )
  ) INTO result;

  RETURN result;
END;
$function$;