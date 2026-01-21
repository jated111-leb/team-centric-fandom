-- Add unique partial index to prevent duplicate webhook records for the same user/match/event
CREATE UNIQUE INDEX IF NOT EXISTS notification_sends_unique_user_match_event 
ON notification_sends (external_user_id, match_id, braze_event_type) 
WHERE match_id IS NOT NULL;