# Quick Reference Guide

## Common Diagnostic Queries

### Check for Stale Pending Schedules
```sql
SELECT 
  sl.match_id,
  sl.braze_schedule_id,
  sl.send_at_utc,
  sl.status,
  m.home_team,
  m.away_team,
  EXTRACT(EPOCH FROM (NOW() - sl.send_at_utc)) / 3600 as hours_overdue
FROM schedule_ledger sl
LEFT JOIN matches m ON sl.match_id = m.id
WHERE sl.status = 'pending'
  AND sl.send_at_utc < NOW()
ORDER BY sl.send_at_utc DESC;
```

### Check for Missing Webhooks
```sql
SELECT 
  sl.match_id,
  sl.braze_schedule_id,
  sl.send_at_utc,
  m.home_team,
  m.away_team
FROM schedule_ledger sl
LEFT JOIN matches m ON sl.match_id = m.id
LEFT JOIN notification_sends ns ON sl.match_id = ns.match_id
WHERE sl.status = 'pending'
  AND sl.send_at_utc < NOW()
  AND ns.id IS NULL;
```

### Count Comparison
```sql
-- Pending schedules in ledger
SELECT COUNT(*) as ledger_pending
FROM schedule_ledger
WHERE status = 'pending'
  AND send_at_utc > NOW();
```

### Recent Errors
```sql
SELECT * FROM scheduler_logs
WHERE action = 'error'
ORDER BY created_at DESC
LIMIT 20;
```

### Function Activity Summary
```sql
SELECT 
  function_name,
  action,
  COUNT(*) as count,
  MAX(created_at) as last_occurrence
FROM scheduler_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY function_name, action
ORDER BY function_name, count DESC;
```

## Health Check Procedure

1. **Check Lock Status**
```sql
SELECT * FROM scheduler_locks;
```

2. **Verify Feature Flag**
```sql
SELECT * FROM feature_flags WHERE flag_name = 'braze_notifications_enabled';
```

3. **Check Recent Scheduler Runs**
```sql
SELECT * FROM scheduler_logs
WHERE function_name = 'braze-scheduler'
  AND action = 'run_complete'
ORDER BY created_at DESC
LIMIT 5;
```

## Emergency Procedures

### If Scheduler is Stuck (Lock Not Released)
```sql
UPDATE scheduler_locks
SET locked_at = NULL, locked_by = NULL, expires_at = NULL
WHERE lock_name = 'braze-scheduler';
```

### If Duplicate Schedules Detected
1. Run `braze-reconcile` function
2. Check for duplicates in Braze via `reconcile-counts`
3. Manual cleanup via `braze-dedupe-fixtures` if needed

### If Notifications Not Sending
1. Check feature flag is enabled
2. Verify schedules exist in ledger with status 'pending'
3. Run `pre-send-verification` to check/recreate in Braze
4. Check Braze dashboard for campaign status

## Function URLs

All functions available at:
`https://howqpclucdljsovsjnrz.supabase.co/functions/v1/{function-name}`

- `braze-scheduler`
- `braze-reconcile`
- `braze-webhook`
- `verify-braze-schedules`
- `pre-send-verification`
- `reconcile-counts`
- `gap-detection`
- `braze-dedupe-fixtures`
