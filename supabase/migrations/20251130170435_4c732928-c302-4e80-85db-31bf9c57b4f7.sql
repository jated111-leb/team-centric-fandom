-- Add status column to schedule_ledger for audit trail
CREATE TYPE schedule_status AS ENUM ('pending', 'sent', 'cancelled');

ALTER TABLE schedule_ledger 
ADD COLUMN status schedule_status NOT NULL DEFAULT 'pending';

-- Create index for efficient status queries
CREATE INDEX idx_schedule_ledger_status ON schedule_ledger(status);
CREATE INDEX idx_schedule_ledger_send_at_status ON schedule_ledger(send_at_utc, status);