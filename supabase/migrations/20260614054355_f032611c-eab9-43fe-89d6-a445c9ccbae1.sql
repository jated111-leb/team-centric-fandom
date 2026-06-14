UPDATE public.wc_schedule_ledger
SET dry_run = false,
    updated_at = now()
WHERE dry_run = true
  AND status IN ('queued', 'pending')
  AND scheduled_send_at_utc > now();