

## Plan: Reframe Scheduler Health + Keep Real Anomaly Detection

### Problem
The current Scheduler Health tab incorrectly flags normal Braze delivery batching (multiple `dispatch_id`s per match) as anomalies. Each `dispatch_id` represents an internal Braze batch of ~50-180 users, not a duplicate schedule.

### What changes

**1. Reframe metrics in `SchedulerHealthSection.tsx`**
- **Remove**: "Multi-Dispatch Matches" card and "Avg Dispatch IDs/Match" card (these reflect normal Braze batching, not bugs)
- **Keep**: "Ledger Duplicates" card (real anomaly: scheduler ran twice for same match)
- **Keep**: "Webhook Duplicates Blocked" card (dedup protection stats)
- **Add**: "Delivery Batches" card -- informational, shows avg batches per match as context (not flagged as error)
- **Add**: "Stale Pending" card -- matches past kickoff still in `pending` status (real anomaly: notification never confirmed sent)

**2. Reframe the anomaly table**
- Only show rows where `scheduleCount > 1` (real ledger duplicates)
- Remove dispatch_id count as an anomaly signal
- Add a "stale pending" section: matches from `schedule_ledger` where `status = 'pending'` and `send_at_utc` is in the past

**3. Update health status logic**
- `hasIssues` = `scheduleLedgerDuplicates > 0` OR stale pending entries exist
- Dispatch ID count is purely informational

**4. Update the SQL in `compute_analytics_summary`**
- Keep `scheduleLedgerDuplicates` query as-is (real signal)
- Keep `webhookDuplicatesSkipped` as-is
- Change `matchesWithMultipleDispatchIds` to `avgDeliveryBatches` (informational only)
- Add `stalePendingCount`: `SELECT COUNT(*) FROM schedule_ledger WHERE status = 'pending' AND send_at_utc < now()`
- Simplify `topAnomalies` to only flag `schedule_count > 1` rows

**5. Update explanation card text**
- Explain that delivery batches are normal Braze behavior
- Focus anomaly language on ledger duplicates and stale pending

### Files changed
- `src/components/analytics/SchedulerHealthSection.tsx` -- reframe cards, table, and logic
- `src/pages/Analytics.tsx` -- update interface + data mapping for new fields
- Database migration -- update `compute_analytics_summary` function

