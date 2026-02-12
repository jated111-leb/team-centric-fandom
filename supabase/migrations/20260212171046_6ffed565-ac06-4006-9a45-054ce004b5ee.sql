CREATE INDEX IF NOT EXISTS idx_notification_sends_sent_match 
ON notification_sends (sent_at, match_id) 
WHERE match_id IS NOT NULL;