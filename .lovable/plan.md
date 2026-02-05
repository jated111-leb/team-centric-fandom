

## Plan: Fix Excessive Scheduler Logging (1.4M+ Unnecessary Rows)

### Problem Summary
The `scheduler_logs` table has 1.98M rows, with **1.4 million (72%)** being `unmatched_featured_team` entries. These are caused by diagnostic logging that runs every 15 minutes for teams that partially match featured teams but lack database mappings.

**Top Offenders:**
- Newcastle United FC: 33,567 logs
- Chelsea FC: 32,334 logs  
- Portsmouth FC: 31,772 logs
- Tottenham Hotspur FC: 31,532 logs
- 80+ other teams with similar counts

---

### Solution: Two-Part Fix

#### Part 1: Prevent Future Duplicate Logging

Modify `supabase/functions/braze-scheduler/index.ts` to only log `unmatched_featured_team` **once per match_id** by checking if we've already logged it:

```typescript
// Before logging, check if we already have this log entry
const { data: existingLog } = await supabase
  .from('scheduler_logs')
  .select('id')
  .eq('match_id', match.id)
  .eq('action', 'unmatched_featured_team')
  .eq('reason', `Team "${match.home_team}" appears to be featured...`)
  .limit(1);

if (!existingLog?.length) {
  // Only log if not already logged for this match
  await supabase.from('scheduler_logs').insert({...});
}
```

**Alternative (simpler):** Remove this diagnostic logging entirely since it's served its purpose - we now know which teams need mappings.

#### Part 2: Clean Up Existing Logs

Run a one-time cleanup to delete duplicate log entries, keeping only the first occurrence:

```sql
-- Delete duplicate unmatched_featured_team logs, keeping oldest per match_id + reason
DELETE FROM scheduler_logs
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY match_id, reason ORDER BY created_at) as rn
    FROM scheduler_logs
    WHERE action = 'unmatched_featured_team'
  ) t
  WHERE rn > 1
);
```

This would reduce ~1.4M rows to ~500 rows (one per unique match/team combo).

#### Part 3: Add Missing Team Mappings (Optional)

If you want these teams to actually be featured, add mappings:

```sql
INSERT INTO team_mappings (raw_name, canonical_name) VALUES
('Chelsea FC', 'Chelsea FC'),
('Tottenham Hotspur FC', 'Tottenham Hotspur FC'),
('Newcastle United FC', 'Newcastle United FC'),
-- etc.
```

---

### Technical Details

**Files to modify:**
- `supabase/functions/braze-scheduler/index.ts` (lines 308-328) - Add deduplication check or remove excessive logging

**Database changes:**
- One-time DELETE query to clean up ~1.4M duplicate rows
- Optional: Add missing team_mappings entries

**Impact:**
- Reduces table size by ~70%
- Prevents ~28,000 new unnecessary logs per day
- Improves query performance on scheduler_logs

---

### Recommended Approach

**Option A (Quick Fix):** Remove the `unmatched_featured_team` logging entirely - it was diagnostic and we now have the data we need.

**Option B (Preserve Diagnostics):** Keep logging but deduplicate by checking existing logs before inserting.

