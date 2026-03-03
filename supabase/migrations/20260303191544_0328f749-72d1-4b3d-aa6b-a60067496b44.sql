
-- Add composite index for the primary filter pattern
CREATE INDEX IF NOT EXISTS idx_ns_event_sent ON notification_sends (braze_event_type, sent_at)
WHERE braze_event_type IN ('canvas.sent', 'push_sent');

-- Rewrite function to scan notification_sends ONCE via CTE
CREATE OR REPLACE FUNCTION compute_analytics_summary(p_start_date TIMESTAMPTZ DEFAULT NULL, p_end_date TIMESTAMPTZ DEFAULT NOW())
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '25s'
AS $$
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

  WITH
  -- Single scan of notification_sends for current period
  ns AS (
    SELECT external_user_id, match_id, home_team, away_team, competition,
           sent_at, event_received_at, raw_payload
    FROM notification_sends
    WHERE braze_event_type IN ('canvas.sent', 'push_sent')
      AND sent_at BETWEEN v_start_date AND v_end_date
  ),
  -- Previous period (just counts)
  ns_prev AS (
    SELECT external_user_id
    FROM notification_sends
    WHERE braze_event_type IN ('canvas.sent', 'push_sent')
      AND sent_at BETWEEN v_prev_start_date AND v_prev_end_date
  ),
  -- Today users
  ns_today AS (
    SELECT COUNT(DISTINCT external_user_id) AS cnt
    FROM notification_sends
    WHERE braze_event_type IN ('canvas.sent', 'push_sent')
      AND sent_at::date = CURRENT_DATE
  ),
  -- User counts
  user_counts AS (
    SELECT external_user_id, COUNT(*) AS cnt
    FROM ns
    GROUP BY external_user_id
  ),
  -- Multi-match users
  multi_match AS (
    SELECT COUNT(DISTINCT external_user_id) AS cnt
    FROM (
      SELECT external_user_id
      FROM ns
      WHERE match_id IS NOT NULL
      GROUP BY external_user_id
      HAVING COUNT(DISTINCT match_id) > 1
    ) mm
  ),
  -- Duplicates (same user + same match > 1)
  dupes AS (
    SELECT
      COALESCE(SUM(c - 1), 0) AS dup_count,
      COUNT(DISTINCT external_user_id) AS affected_users
    FROM (
      SELECT external_user_id, match_id, COUNT(*) AS c
      FROM ns
      WHERE match_id IS NOT NULL
      GROUP BY external_user_id, match_id
      HAVING COUNT(*) > 1
    ) d
  ),
  -- Hourly distribution
  hourly AS (
    SELECT EXTRACT(HOUR FROM sent_at)::int AS hour, COUNT(*) AS count
    FROM ns
    GROUP BY 1
  ),
  -- Frequency distribution
  freq AS (
    SELECT
      CASE
        WHEN cnt = 1 THEN '1 notification'
        WHEN cnt BETWEEN 2 AND 5 THEN '2-5 notifications'
        WHEN cnt BETWEEN 6 AND 10 THEN '6-10 notifications'
        ELSE '10+ notifications'
      END AS range,
      COUNT(*) AS count
    FROM user_counts
    GROUP BY 1
  ),
  -- Team breakdown (featured teams only)
  team_data AS (
    SELECT team, SUM(cnt) AS notifications, COUNT(DISTINCT external_user_id) AS unique_users
    FROM (
      SELECT home_team AS team, external_user_id, COUNT(*) AS cnt
      FROM ns
      WHERE home_team IS NOT NULL AND home_team IN (SELECT team_name FROM featured_teams)
      GROUP BY home_team, external_user_id
      UNION ALL
      SELECT away_team AS team, external_user_id, COUNT(*) AS cnt
      FROM ns
      WHERE away_team IS NOT NULL AND away_team IN (SELECT team_name FROM featured_teams)
      GROUP BY away_team, external_user_id
    ) t
    GROUP BY team
    ORDER BY unique_users DESC
    LIMIT 15
  ),
  -- Competition breakdown
  comp_data AS (
    SELECT competition, COUNT(*) AS notifications, COUNT(DISTINCT external_user_id) AS unique_users
    FROM ns
    WHERE competition IS NOT NULL
    GROUP BY competition
    ORDER BY notifications DESC
  ),
  -- Avg delivery batches
  batch_data AS (
    SELECT COALESCE(ROUND(AVG(dc)::numeric, 2), 0) AS avg_batches
    FROM (
      SELECT match_id, COUNT(DISTINCT raw_payload->>'dispatch_id') AS dc
      FROM ns
      WHERE match_id IS NOT NULL
      GROUP BY match_id
    ) b
  ),
  -- Schedule ledger duplicates
  ledger_dupes AS (
    SELECT match_id, COUNT(*) AS schedule_count
    FROM schedule_ledger
    WHERE created_at BETWEEN v_start_date AND v_end_date
    GROUP BY match_id
    HAVING COUNT(*) > 1
  ),
  -- Stale pending
  stale AS (
    SELECT sl.match_id, COALESCE(m.home_team, 'N/A') AS home_team,
           COALESCE(m.away_team, 'N/A') AS away_team,
           sl.send_at_utc, sl.created_at
    FROM schedule_ledger sl
    LEFT JOIN matches m ON m.id = sl.match_id
    WHERE sl.status = 'pending' AND sl.send_at_utc < NOW()
    ORDER BY sl.send_at_utc DESC
    LIMIT 10
  ),
  -- Webhook duplicates skipped
  wh_dupes AS (
    SELECT COALESCE(SUM((details->>'duplicates_skipped')::int), 0) AS cnt
    FROM scheduler_logs
    WHERE function_name = 'braze-webhook'
      AND action = 'duplicates_skipped'
      AND created_at BETWEEN v_start_date AND v_end_date
  )
  SELECT json_build_object(
    'userStats', json_build_object(
      'totalUsers', (SELECT COUNT(*) FROM user_counts),
      'usersWithMultiple', (SELECT COUNT(*) FROM user_counts WHERE cnt > 1),
      'totalNotifications', (SELECT COALESCE(SUM(cnt), 0) FROM user_counts),
      'avgNotificationsPerUser', (SELECT COALESCE(ROUND(AVG(cnt)::numeric, 2), 0) FROM user_counts),
      'todayUsers', (SELECT cnt FROM ns_today),
      'multiMatchUsers', (SELECT cnt FROM multi_match)
    ),
    'periodComparison', json_build_object(
      'currentPeriodNotifications', (SELECT COALESCE(SUM(cnt), 0) FROM user_counts),
      'previousPeriodNotifications', (SELECT COUNT(*) FROM ns_prev),
      'currentPeriodUsers', (SELECT COUNT(*) FROM user_counts),
      'previousPeriodUsers', (SELECT COUNT(DISTINCT external_user_id) FROM ns_prev)
    ),
    'frequencyDistribution', (SELECT COALESCE(json_agg(json_build_object('range', range, 'count', count)), '[]'::json) FROM freq),
    'deliveryStats', json_build_object(
      'correlationRate', (SELECT ROUND((COUNT(*) FILTER (WHERE match_id IS NOT NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) FROM ns),
      'naRate', (SELECT ROUND((COUNT(*) FILTER (WHERE home_team IS NULL OR away_team IS NULL)::numeric / NULLIF(COUNT(*), 0)) * 100, 2) FROM ns),
      'totalSent', (SELECT COALESCE(SUM(cnt), 0) FROM user_counts),
      'avgWebhookLatency', (SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (event_received_at - sent_at)))::numeric, 2), 0) FROM ns WHERE event_received_at IS NOT NULL),
      'hourlyDistribution', (SELECT COALESCE(json_agg(json_build_object('hour', hour, 'count', count) ORDER BY hour), '[]'::json) FROM hourly)
    ),
    'contentStats', json_build_object(
      'byTeam', (SELECT COALESCE(json_agg(json_build_object('team', team, 'count', notifications, 'uniqueUsers', unique_users)), '[]'::json) FROM team_data),
      'byCompetition', (
        SELECT COALESCE(json_agg(json_build_object(
          'competition', COALESCE(ct.english_name, cd.competition),
          'code', cd.competition,
          'count', cd.notifications,
          'uniqueUsers', cd.unique_users
        )), '[]'::json)
        FROM comp_data cd
        LEFT JOIN competition_translations ct ON ct.competition_code = cd.competition
      )
    ),
    'duplicates', (SELECT json_build_object('count', dup_count, 'affectedUsers', affected_users) FROM dupes),
    'schedulerHealth', json_build_object(
      'avgDeliveryBatches', (SELECT avg_batches FROM batch_data),
      'scheduleLedgerDuplicates', (SELECT COUNT(*) FROM ledger_dupes),
      'stalePendingCount', (SELECT COUNT(*) FROM schedule_ledger WHERE status = 'pending' AND send_at_utc < NOW()),
      'stalePendingMatches', (SELECT COALESCE(json_agg(json_build_object('matchId', match_id, 'homeTeam', home_team, 'awayTeam', away_team, 'sendAtUtc', send_at_utc, 'createdAt', created_at)), '[]'::json) FROM stale),
      'webhookDuplicatesSkipped', (SELECT cnt FROM wh_dupes),
      'ledgerDuplicateDetails', (
        SELECT COALESCE(json_agg(json_build_object('matchId', ld.match_id, 'homeTeam', COALESCE(m.home_team, 'N/A'), 'awayTeam', COALESCE(m.away_team, 'N/A'), 'scheduleCount', ld.schedule_count)), '[]'::json)
        FROM ledger_dupes ld
        LEFT JOIN matches m ON m.id = ld.match_id
      )
    ),
    'dateRange', json_build_object('start', v_start_date, 'end', v_end_date)
  ) INTO result;

  RETURN result;
END;
$$;
