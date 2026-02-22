
## Fix: Critical Analytics Bug + Webhook Dedup Scale Safety

### Critical Bug Found

PR #2 introduced a filter `braze_event_type ILIKE '%send%'` across both database functions (`compute_analytics_summary` and `get_match_performance`). However, the actual event types in the database are:

- `canvas.sent` (68,539 rows)
- `push_sent` (16,562 rows)

Neither contains the substring **"send"** -- they contain **"sent"**. The filter currently matches **zero rows**, meaning the analytics dashboard is showing zeros/nulls for all metrics.

### Changes

#### 1. Fix the broken filter in both database functions (CRITICAL)

Replace `ILIKE '%send%'` with `braze_event_type IN ('canvas.sent', 'push_sent')` in both `compute_analytics_summary` and `get_match_performance`. This is safer than `ILIKE '%sent%'` because:
- It's an exact match -- no risk of accidentally including future event types like `canvas.sentiment_analyzed`
- It's faster (equality check vs pattern matching on every row)
- It documents exactly which events count as "sends"

This requires a new database migration that recreates both functions with the corrected filter.

#### 2. Add `sent_at` date filter to the webhook dedup query

In `supabase/functions/braze-webhook/index.ts`, the deduplication query (Phase 5, line 211) fetches ALL `notification_sends` rows for the given match IDs with no date bound. As the table grows, this will slow down. Add a `sent_at` filter scoped to a reasonable window (e.g., last 48 hours) so the query stays fast even at scale.

### Risk Management

- The database function fix is a simple string replacement (`ILIKE '%send%'` to `IN ('canvas.sent', 'push_sent')`) with no logic changes
- The webhook dedup change only narrows the lookup window -- duplicates older than 48 hours are irrelevant since matches don't repeat
- Both changes are independently safe and can be rolled back without affecting each other

### Technical Details

**Migration SQL** will `CREATE OR REPLACE` both functions, changing ~25 occurrences of `ILIKE '%send%'` to `IN ('canvas.sent', 'push_sent')`.

**Webhook edge function** change: add `.gte('sent_at', cutoffDate)` to the existing dedup query on line 211-214, where `cutoffDate` is 48 hours before the earliest event timestamp in the batch.
