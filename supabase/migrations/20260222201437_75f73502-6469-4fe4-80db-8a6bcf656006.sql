-- Performance optimization: targeted indexes + correlated subquery elimination
-- Addresses statement_timeout (57014) on compute_analytics_summary

-- ============================================================
-- 1) COMPOSITE INDEX on scheduler_logs for the dashboard query
--    Replaces 3 separate single-column indexes for the filter:
--    function_name = 'braze-webhook' AND action = 'duplicates_skipped' AND created_at BETWEEN...
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_fn_action_created
ON scheduler_logs (function_name, action, created_at DESC);

-- ============================================================
-- 2) EXPRESSION INDEX on notification_sends for dispatch_id extraction
--    Eliminates row-by-row JSON parsing in COUNT(DISTINCT raw_payload->>'dispatch_id')
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notification_sends_dispatch_id
ON notification_sends ((raw_payload->>'dispatch_id'))
WHERE raw_payload IS NOT NULL AND raw_payload ? 'dispatch_id';

-- ============================================================
-- 3) DROP DUPLICATE INDEXES (exact duplicates wasting write IO)
-- ============================================================
-- idx_notification_sends_match and idx_notification_sends_match_id are identical (btree on match_id)
DROP INDEX IF EXISTS idx_notification_sends_match;
-- idx_notification_sends_external_user_id and idx_notification_sends_user are identical (btree on external_user_id)
DROP INDEX IF EXISTS idx_notification_sends_user;

-- ============================================================
-- 4) Drop now-redundant single-column indexes on scheduler_logs
--    The new composite index covers all three filter columns
-- ============================================================
DROP INDEX IF EXISTS idx_scheduler_logs_action;
DROP INDEX IF EXISTS idx_scheduler_logs_function;
-- Keep idx_scheduler_logs_created (used independently for time-range queries)

-- ============================================================
-- 5) REFACTOR compute_analytics_summary: eliminate correlated subquery
--    topAnomalies previously ran COUNT(*) FROM schedule_ledger per match row
--    Now uses a CTE join pattern: 2 scans + 1 join instead of N correlated counts
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_analytics_summary(
  p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end_date timestamp with time zone DEFAULT now()
)
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
            AND braze_event_type IN ('canvas.sent', 'push_sent')
        ),
        'multiMatchUsers', (
          SELECT COUNT(DISTINCT external_user_id)
          FROM (
            SELECT external_user_id
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND match_id IS NOT NULL
              AND braze_event_type IN ('canvas.sent', 'push_sent')
            GROUP BY external_user_id
            HAVING COUNT(DISTINCT match_id) > 1
          ) multi_match
        )
      )
      FROM (
        SELECT external_user_id, COUNT(*) as cnt
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
        GROUP BY external_user_id
      ) user_counts
    ),
    'periodComparison', json_build_object(
      'currentPeriodNotifications', (
        SELECT COUNT(*) FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
      ),
      'previousPeriodNotifications', (
        SELECT COUNT(*) FROM notification_sends
        WHERE sent_at BETWEEN v_prev_start_date AND v_prev_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
      ),
      'currentPeriodUsers', (
        SELECT COUNT(DISTINCT external_user_id) FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
      ),
      'previousPeriodUsers', (
        SELECT COUNT(DISTINCT external_user_id) FROM notification_sends
        WHERE sent_at BETWEEN v_prev_start_date AND v_prev_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
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
            AND braze_event_type IN ('canvas.sent', 'push_sent')
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
          AND braze_event_type IN ('canvas.sent', 'push_sent')
      ),
      'naRate', (
        SELECT ROUND(
          (COUNT(*) FILTER (WHERE home_team IS NULL OR away_team IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100,
          2
        )
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
      ),
      'totalSent', (
        SELECT COUNT(*) FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
      ),
      'avgWebhookLatency', (
        SELECT COALESCE(
          ROUND(AVG(EXTRACT(EPOCH FROM (event_received_at - sent_at)))::numeric, 2),
          0
        )
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND braze_event_type IN ('canvas.sent', 'push_sent')
          AND event_received_at IS NOT NULL
      ),
      'hourlyDistribution', (
        SELECT COALESCE(json_agg(json_build_object('hour', hour, 'count', count)), '[]'::json)
        FROM (
          SELECT EXTRACT(HOUR FROM sent_at) as hour, COUNT(*) as count
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND braze_event_type IN ('canvas.sent', 'push_sent')
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
              AND braze_event_type IN ('canvas.sent', 'push_sent')
            GROUP BY home_team, external_user_id
            UNION ALL
            SELECT away_team as team, external_user_id, COUNT(*) as cnt
            FROM notification_sends
            WHERE sent_at BETWEEN v_start_date AND v_end_date
              AND away_team IS NOT NULL
              AND away_team IN (SELECT team_name FROM featured_teams)
              AND braze_event_type IN ('canvas.sent', 'push_sent')
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
            AND braze_event_type IN ('canvas.sent', 'push_sent')
          GROUP BY competition
          ORDER BY notifications DESC
        ) ns
        LEFT JOIN competition_translations ct ON ct.competition_code = ns.competition
      )
    ),
    'duplicates', (
      SELECT json_build_object(
        'count', COALESCE(SUM(cnt - 1), 0),
        'affectedUsers', COUNT(DISTINCT external_user_id)
      )
      FROM (
        SELECT external_user_id, match_id, COUNT(*) as cnt
        FROM notification_sends
        WHERE sent_at BETWEEN v_start_date AND v_end_date
          AND match_id IS NOT NULL
          AND braze_event_type IN ('canvas.sent', 'push_sent')
        GROUP BY external_user_id, match_id
        HAVING COUNT(*) > 1
      ) dupes
    ),
    'schedulerHealth', json_build_object(
      'matchesWithMultipleDispatchIds', (
        SELECT COUNT(*)
        FROM (
          SELECT match_id
          FROM notification_sends
          WHERE sent_at BETWEEN v_start_date AND v_end_date
            AND match_id IS NOT NULL
            AND braze_event_type IN ('canvas.sent', 'push_sent')
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
            AND braze_event_type IN ('canvas.sent', 'push_sent')
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
        -- CTE-based: pre-aggregate schedule_ledger once, join once
        -- instead of N correlated COUNT(*) subqueries
        SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
        FROM (
          WITH ledger_counts AS (
            SELECT match_id, COUNT(*) AS schedule_count
            FROM schedule_ledger
            GROUP BY match_id
          ),
          send_groups AS (
            SELECT
              ns.match_id,
              ns.home_team,
              ns.away_team,
              COUNT(DISTINCT ns.raw_payload->>'dispatch_id') AS dispatch_id_count
            FROM notification_sends ns
            WHERE ns.sent_at BETWEEN v_start_date AND v_end_date
              AND ns.match_id IS NOT NULL
              AND ns.braze_event_type IN ('canvas.sent', 'push_sent')
            GROUP BY ns.match_id, ns.home_team, ns.away_team
          )
          SELECT
            sg.match_id AS "matchId",
            sg.home_team AS "homeTeam",
            sg.away_team AS "awayTeam",
            sg.dispatch_id_count AS "dispatchIdCount",
            COALESCE(lc.schedule_count, 0) AS "scheduleCount"
          FROM send_groups sg
          LEFT JOIN ledger_counts lc ON lc.match_id = sg.match_id
          WHERE sg.dispatch_id_count > 1
             OR COALESCE(lc.schedule_count, 0) > 1
          ORDER BY sg.dispatch_id_count DESC
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