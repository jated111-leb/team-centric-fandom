-- Lock table for scheduler coordination
CREATE TABLE IF NOT EXISTS scheduler_locks (
  lock_name TEXT PRIMARY KEY,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by TEXT,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Insert lock row for braze-scheduler
INSERT INTO scheduler_locks (lock_name) VALUES ('braze-scheduler') ON CONFLICT DO NOTHING;
INSERT INTO scheduler_locks (lock_name) VALUES ('braze-reconcile') ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE scheduler_locks ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for scheduler_locks
CREATE POLICY "Admins can view scheduler locks"
ON scheduler_locks
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update scheduler locks"
ON scheduler_locks
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Prevent duplicate schedules for same match (only one pending/sent per match)
CREATE UNIQUE INDEX IF NOT EXISTS schedule_ledger_match_pending_unique 
ON schedule_ledger (match_id) 
WHERE status IN ('pending', 'sent');