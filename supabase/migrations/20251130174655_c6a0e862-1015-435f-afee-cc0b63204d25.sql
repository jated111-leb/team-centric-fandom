-- Add Canvas-specific columns to notification_sends table
ALTER TABLE notification_sends 
ADD COLUMN IF NOT EXISTS canvas_id text,
ADD COLUMN IF NOT EXISTS canvas_name text,
ADD COLUMN IF NOT EXISTS canvas_step_name text,
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'campaign';

-- Add index for filtering by source type
CREATE INDEX IF NOT EXISTS idx_notification_sends_source_type ON notification_sends(source_type);

-- Add index for canvas_id lookups
CREATE INDEX IF NOT EXISTS idx_notification_sends_canvas_id ON notification_sends(canvas_id) WHERE canvas_id IS NOT NULL;