

## Fix: Analytics Dashboard Statement Timeout

### Root Cause
The `compute_analytics_summary` database function times out because:
1. **`scheduler_logs` has 2M rows** (mostly junk `unmatched_featured_team` entries) and the function queries it for webhook duplicate counts
2. **JSONB field extraction** (`raw_payload->>'dispatch_id'`) on 65K `notification_sends` rows has no index, causing full scans
3. **Correlated subqueries** in `topAnomalies` re-query `schedule_ledger` for every match group

### Fix (Two Steps)

#### Step 1: Clean up scheduler_logs (immediate relief)
Delete the ~1.4M redundant `unmatched_featured_team` entries we already identified:

```sql
DELETE FROM scheduler_logs WHERE action = 'unmatched_featured_team';
```

This alone cuts the table from 2M to ~600K rows and speeds up the `webhookDuplicatesSkipped` query.

#### Step 2: Add a composite index for the JSONB dispatch_id extraction

```sql
CREATE INDEX idx_notification_sends_sent_match 
ON notification_sends (sent_at, match_id) 
WHERE match_id IS NOT NULL;
```

This helps the `schedulerHealth` section of the function efficiently filter by date range and group by `match_id` without full table scans.

#### Step 3: Remove excessive logging from braze-scheduler
Modify `supabase/functions/braze-scheduler/index.ts` to remove the `unmatched_featured_team` logging that creates ~28K unnecessary rows per day, preventing the problem from recurring.

### What stays the same
- The `compute_analytics_summary` SQL function itself does NOT need changes -- your queries are correct
- The frontend Analytics page code is fine
- No schema changes needed

### Expected Result
- Analytics page loads within 2-3 seconds instead of timing out
- `scheduler_logs` table reduced from 2M to ~600K rows
- No more daily log bloat from unmatched team warnings
