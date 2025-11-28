-- Add dispatch_id and send_id columns to schedule_ledger table
ALTER TABLE public.schedule_ledger 
ADD COLUMN IF NOT EXISTS dispatch_id text,
ADD COLUMN IF NOT EXISTS send_id text;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_schedule_ledger_dispatch_id ON public.schedule_ledger(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_schedule_ledger_send_id ON public.schedule_ledger(send_id);

-- Add comment to explain the new columns
COMMENT ON COLUMN public.schedule_ledger.dispatch_id IS 'Unique dispatch ID from Braze for this scheduled send';
COMMENT ON COLUMN public.schedule_ledger.send_id IS 'Send ID from Braze for this scheduled send';