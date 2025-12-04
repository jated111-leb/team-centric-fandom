# Quick Reference Guide - Notification System Issues

## 🎯 TL;DR

**Can duplicate notifications be sent?**  
✅ **YES**, but low probability. Main risk is from flawed post-run deduplication logic.

**Are there tracking gaps?**  
✅ **YES**, significant gaps in reconciling scheduled vs sent counts.

**Action Required:**  
🔴 Remove lines 635-708 from `braze-scheduler/index.ts` immediately.

---

## 🔴 Critical Issues (Fix Immediately)

### Issue #1: Post-Run Deduplication Can Delete Correct Schedule

**File:** `supabase/functions/braze-scheduler/index.ts`  
**Lines:** 635-708  
**Fix:** **DELETE THESE LINES**

**Why it's broken:**
```
Process A creates schedule S1 → updates ledger to S1
Process B creates schedule S2 → updates ledger to S2 (overwrites S1)
Process A's deduplication runs → sees ledger shows S2 → deletes S2
Result: S1 exists but ledger points to deleted S2 ❌
```

**Safe to delete because:**
- Unique constraint on `match_id` already prevents duplicates
- Reconcile function cancels duplicates daily
- Pre-flight check at line 379-384 catches most races

---

### Issue #2: Lock Timeout Too Short

**Files:** 
- `supabase/functions/braze-scheduler/index.ts:26`
- `supabase/functions/braze-reconcile/index.ts:8`

**Current:**
```typescript
const LOCK_TIMEOUT_MINUTES = 5;
```

**Change to:**
```typescript
const LOCK_TIMEOUT_MINUTES = 10; // Translation API 15s × 20 teams = 5min
```

**Why:**
- Translation API: 15s timeout per team
- Braze API: 2s per match
- Worst case: ~8 minutes total
- 5 minutes is too tight, causes lock expiry mid-run

---

## 🟠 High Priority Issues (Fix This Sprint)

### Issue #3: Webhook Correlation Uses Risky Time-Based Fallback

**File:** `supabase/functions/braze-webhook/index.ts`  
**Lines:** 118-150

**Problem:** If 3 matches kick off at the same time (e.g., 3:00 PM), all send at 2:00 PM. Webhooks use 4-minute time window to match, can pick wrong match.

**Fix:** Add confidence scoring and logging

```typescript
// After line 150, add:
const correlation = {
  match_id: matchId,
  confidence: dispatchId ? 'high' : closestDiff < 10000 ? 'medium' : 'low',
  method: dispatchId ? 'dispatch_id' : 'time_window',
  time_diff_ms: closestDiff,
};

if (correlation.confidence === 'low') {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-webhook',
    action: 'low_confidence_correlation',
    reason: `Time-based match with ${closestDiff}ms difference`,
    details: { correlation, possible_matches: timeMatchedEntries?.length },
  });
}
```

---

### Issue #4: No Count Reconciliation

**Problem:** Never verify that ledger count equals Braze schedule count.

**Fix:** Create new edge function `braze-count-audit`

**Quick implementation:**
1. Copy `supabase/functions/braze-reconcile/index.ts`
2. Rename to `braze-count-audit`
3. Replace reconciliation logic with count comparison:

```typescript
const { count: ledgerCount } = await supabase
  .from('schedule_ledger')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'pending')
  .gte('send_at_utc', now.toISOString());

const brazeCount = ourBroadcasts.length;
const delta = brazeCount - (ledgerCount || 0);

if (delta !== 0) {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-count-audit',
    action: 'count_mismatch',
    reason: `Braze has ${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} schedules`,
    details: { ledger: ledgerCount, braze: brazeCount, delta },
  });
}
```

4. Add cron job: `0 2 * * *` (2 AM daily)

---

## 🟡 Medium Priority Issues (Fix Next Sprint)

### Issue #5: Missing dispatch_id and send_id

**Problem:** Ledger doesn't capture `dispatch_id` and `send_id` that Braze assigns at send time. This causes webhook correlation to fall back to risky time-based matching.

**Why it happens:**
```typescript
// braze-scheduler/index.ts:576
const createData = await createRes.json();
// dispatch_id and send_id are often NULL at creation time
// They're assigned by Braze when the schedule triggers
```

**Fix:** Create `braze-preflight-check` function that runs 10 minutes before each send to fetch updated IDs.

---

### Issue #6: No Webhook Health Monitoring

**Problem:** Can't answer:
- What % of webhooks arrive?
- How delayed are webhooks?
- Which matches have missing webhooks?

**Fix:** Create `webhook_health_metrics` table and daily aggregation job.

---

## 📊 Quick Diagnostics

### Check for Duplicate Schedules in Braze

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/braze-reconcile \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Check logs for "duplicate_cancelled" actions
```

### Check for Stale Pending Schedules

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/verify-braze-schedules \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Look for "past_no_webhook" in response
```

### Check Webhook Correlation Quality

```sql
-- View recent low-confidence correlations
SELECT * FROM scheduler_logs
WHERE function_name = 'braze-webhook'
  AND action = 'low_confidence_correlation'
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Check Count Mismatch

```bash
# Run count audit manually
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/braze-count-audit \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Should return: { ledger_pending: X, braze_actual: X, delta: 0 }
```

---

## 🧪 Testing Checklist

### After Fixing Issue #1 (Remove Deduplication)

- [ ] Run scheduler twice concurrently → Second returns "Already running"
- [ ] Check Braze for duplicates → Should be 0
- [ ] Check `schedule_ledger` for duplicates → Should be 0

### After Fixing Issue #2 (Lock Timeout)

- [ ] Mock translation API to 14s delay
- [ ] Run scheduler with 50 untranslated teams
- [ ] Check logs for lock timeout errors → Should be 0

### After Fixing Issue #3 (Webhook Logging)

- [ ] Create 3 matches at same kickoff time
- [ ] Wait for notifications to send
- [ ] Check logs for `low_confidence_correlation` → Should see entries

### After Fixing Issue #4 (Count Audit)

- [ ] Manually create duplicate in Braze dashboard
- [ ] Run count audit
- [ ] Check logs for `count_mismatch` → Should detect +1

---

## 🚦 Status Indicators

### How to tell if the system is healthy:

✅ **Healthy Signs:**
```sql
-- No count mismatches
SELECT * FROM scheduler_logs 
WHERE action = 'count_mismatch' 
  AND created_at > NOW() - INTERVAL '7 days';
-- Expected: 0 rows

-- No stale pending schedules
SELECT COUNT(*) FROM schedule_ledger
WHERE status = 'pending' 
  AND send_at_utc < NOW();
-- Expected: 0

-- No lock timeout errors
SELECT * FROM scheduler_logs
WHERE action = 'error'
  AND reason LIKE '%lock%timeout%'
  AND created_at > NOW() - INTERVAL '7 days';
-- Expected: 0 rows
```

⚠️ **Warning Signs:**
```sql
-- Multiple low-confidence webhook correlations
SELECT COUNT(*) FROM scheduler_logs
WHERE action = 'low_confidence_correlation'
  AND created_at > NOW() - INTERVAL '24 hours';
-- Warning if: >10 per day

-- High skip rate
SELECT 
  SUM((details->>'skipped')::int) as total_skipped,
  SUM((details->>'scheduled')::int) as total_scheduled
FROM scheduler_logs
WHERE action = 'run_complete'
  AND created_at > NOW() - INTERVAL '7 days';
-- Warning if: skipped > 20% of scheduled
```

🔴 **Critical Signs:**
```sql
-- Count mismatch >5
SELECT * FROM scheduler_logs
WHERE action = 'count_mismatch'
  AND ABS((details->>'delta')::int) > 5;
-- Critical if: Any rows

-- Stale pending >24 hours
SELECT COUNT(*) FROM schedule_ledger
WHERE status = 'pending'
  AND send_at_utc < NOW() - INTERVAL '24 hours';
-- Critical if: >0

-- Duplicate schedules detected
SELECT * FROM scheduler_logs
WHERE action = 'duplicate_cancelled'
  AND created_at > NOW() - INTERVAL '1 day';
-- Critical if: >10 per day
```

---

## 💡 Pro Tips

### When debugging webhook correlation issues:

```sql
-- Find all notification sends for a match
SELECT 
  ns.external_user_id,
  ns.sent_at,
  ns.match_id,
  sl.braze_schedule_id,
  sl.send_at_utc
FROM notification_sends ns
LEFT JOIN schedule_ledger sl ON ns.match_id = sl.match_id
WHERE ns.match_id = YOUR_MATCH_ID;
```

### When debugging duplicate schedules:

```bash
# Fetch all Braze schedules
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/fetch-braze-schedules \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Group by match_id in results
# Look for multiple schedule_ids with same match_id in trigger_properties
```

### When debugging stale pending:

```sql
-- Find schedules that should have sent but have no webhooks
SELECT 
  sl.*,
  (SELECT COUNT(*) FROM notification_sends WHERE match_id = sl.match_id) as webhook_count
FROM schedule_ledger sl
WHERE sl.status = 'pending'
  AND sl.send_at_utc < NOW()
ORDER BY sl.send_at_utc DESC;
```

---

## 📞 Escalation Matrix

| Issue | Severity | Action | Contact |
|-------|----------|--------|---------|
| Duplicate notification reported by user | 🔴 Critical | Run reconcile immediately | On-call engineer |
| Count mismatch >10 | 🔴 Critical | Investigate + manual cleanup | Lead developer |
| Stale pending >24h | 🟠 High | Run verify + manual review | Developer on duty |
| Lock timeout error | 🟡 Medium | Check function runtime | Developer on duty |
| Low-confidence webhook >10/day | 🟡 Medium | Review match schedule times | Product team |

---

## 🔗 Related Documents

- **SECURITY_AUDIT_FINDINGS.md** - Full technical analysis (9 issues identified)
- **RACE_CONDITION_SCENARIOS.md** - Timeline diagrams of failure scenarios
- **TRACKING_GAPS_ANALYSIS.md** - Detailed tracking gap analysis (7 gaps)
- **AUDIT_SUMMARY_AND_RECOMMENDATIONS.md** - Executive summary + implementation plan

---

## 📅 Recommended Maintenance Schedule

| Task | Frequency | Function | Purpose |
|------|-----------|----------|---------|
| Count audit | Daily at 2 AM | `braze-count-audit` | Detect duplicates |
| Reconciliation | Daily at 3 AM | `braze-reconcile` | Cancel orphans |
| Verification | Weekly | `braze-verify-schedules` | Find stale pending |
| Gap detection | Daily at 6 AM | `gap-detection` | Find missing schedules |
| Manual review of logs | Weekly | `scheduler_logs` queries | Spot trends |

---

**Last Updated:** December 4, 2025  
**Maintainer:** Development Team  
**Review Required:** After any changes to scheduling logic

---
