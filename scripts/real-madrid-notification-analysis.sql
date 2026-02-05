-- Real Madrid Notification Analysis Queries
-- Run these queries against the Supabase database to get notification statistics

-- ============================================================================
-- QUERY 1: List all Real Madrid games with notifications sent
-- Shows each unique match, kickoff time, competition, and when notifications were sent
-- ============================================================================

SELECT DISTINCT
    ns.match_id,
    ns.home_team,
    ns.away_team,
    ns.competition,
    ns.kickoff_utc,
    MIN(ns.sent_at) as first_notification_sent,
    MAX(ns.sent_at) as last_notification_sent,
    COUNT(DISTINCT ns.external_user_id) as unique_users_notified,
    COUNT(*) as total_notifications
FROM notification_sends ns
WHERE
    (ns.home_team ILIKE '%Real Madrid%' OR ns.away_team ILIKE '%Real Madrid%')
GROUP BY
    ns.match_id,
    ns.home_team,
    ns.away_team,
    ns.competition,
    ns.kickoff_utc
ORDER BY ns.kickoff_utc DESC;


-- ============================================================================
-- QUERY 2: Summary statistics for Real Madrid notifications
-- ============================================================================

SELECT
    COUNT(DISTINCT match_id) as total_real_madrid_games,
    COUNT(DISTINCT external_user_id) as total_unique_users,
    COUNT(*) as total_notifications_sent,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT match_id), 0), 2) as avg_notifications_per_game,
    ROUND(COUNT(DISTINCT external_user_id)::numeric / NULLIF(COUNT(DISTINCT match_id), 0), 2) as avg_unique_users_per_game
FROM notification_sends
WHERE home_team ILIKE '%Real Madrid%' OR away_team ILIKE '%Real Madrid%';


-- ============================================================================
-- QUERY 3: Users per Real Madrid game (detailed breakdown)
-- ============================================================================

SELECT
    ns.match_id,
    CASE
        WHEN ns.home_team ILIKE '%Real Madrid%' THEN ns.home_team || ' vs ' || ns.away_team
        ELSE ns.away_team || ' vs ' || ns.home_team
    END as match_description,
    ns.competition,
    ns.kickoff_utc AT TIME ZONE 'Asia/Baghdad' as kickoff_baghdad,
    COUNT(DISTINCT ns.external_user_id) as unique_users,
    COUNT(*) as total_notifications,
    COUNT(DISTINCT ns.braze_event_type) as event_types
FROM notification_sends ns
WHERE
    (ns.home_team ILIKE '%Real Madrid%' OR ns.away_team ILIKE '%Real Madrid%')
GROUP BY
    ns.match_id,
    ns.home_team,
    ns.away_team,
    ns.competition,
    ns.kickoff_utc
ORDER BY unique_users DESC;


-- ============================================================================
-- QUERY 4: Real Madrid games by competition
-- ============================================================================

SELECT
    ns.competition,
    COUNT(DISTINCT ns.match_id) as games,
    COUNT(DISTINCT ns.external_user_id) as unique_users,
    COUNT(*) as total_notifications
FROM notification_sends ns
WHERE
    (ns.home_team ILIKE '%Real Madrid%' OR ns.away_team ILIKE '%Real Madrid%')
GROUP BY ns.competition
ORDER BY games DESC;


-- ============================================================================
-- QUERY 5: Real Madrid Home vs Away breakdown
-- ============================================================================

SELECT
    CASE
        WHEN home_team ILIKE '%Real Madrid%' THEN 'Home'
        ELSE 'Away'
    END as venue,
    COUNT(DISTINCT match_id) as games,
    COUNT(DISTINCT external_user_id) as unique_users,
    COUNT(*) as total_notifications
FROM notification_sends
WHERE home_team ILIKE '%Real Madrid%' OR away_team ILIKE '%Real Madrid%'
GROUP BY
    CASE
        WHEN home_team ILIKE '%Real Madrid%' THEN 'Home'
        ELSE 'Away'
    END;


-- ============================================================================
-- QUERY 6: Notification event types for Real Madrid games
-- ============================================================================

SELECT
    braze_event_type,
    COUNT(*) as count,
    COUNT(DISTINCT match_id) as games_affected,
    COUNT(DISTINCT external_user_id) as users_affected
FROM notification_sends
WHERE home_team ILIKE '%Real Madrid%' OR away_team ILIKE '%Real Madrid%'
GROUP BY braze_event_type
ORDER BY count DESC;


-- ============================================================================
-- QUERY 7: Daily notification trend for Real Madrid games
-- ============================================================================

SELECT
    sent_at::date as send_date,
    COUNT(DISTINCT match_id) as games,
    COUNT(DISTINCT external_user_id) as unique_users,
    COUNT(*) as notifications
FROM notification_sends
WHERE home_team ILIKE '%Real Madrid%' OR away_team ILIKE '%Real Madrid%'
GROUP BY sent_at::date
ORDER BY send_date DESC
LIMIT 30;


-- ============================================================================
-- QUERY 8: Most engaged users for Real Madrid games
-- Top users who received the most Real Madrid notifications
-- ============================================================================

SELECT
    external_user_id,
    COUNT(DISTINCT match_id) as games_notified,
    COUNT(*) as total_notifications,
    MIN(sent_at) as first_notification,
    MAX(sent_at) as last_notification
FROM notification_sends
WHERE home_team ILIKE '%Real Madrid%' OR away_team ILIKE '%Real Madrid%'
GROUP BY external_user_id
ORDER BY games_notified DESC
LIMIT 20;


-- ============================================================================
-- QUERY 9: Real Madrid opponent analysis
-- Which opponents generate most user engagement
-- ============================================================================

SELECT
    CASE
        WHEN home_team ILIKE '%Real Madrid%' THEN away_team
        ELSE home_team
    END as opponent,
    COUNT(DISTINCT match_id) as games,
    COUNT(DISTINCT external_user_id) as unique_users,
    COUNT(*) as total_notifications
FROM notification_sends
WHERE home_team ILIKE '%Real Madrid%' OR away_team ILIKE '%Real Madrid%'
GROUP BY
    CASE
        WHEN home_team ILIKE '%Real Madrid%' THEN away_team
        ELSE home_team
    END
ORDER BY unique_users DESC;
