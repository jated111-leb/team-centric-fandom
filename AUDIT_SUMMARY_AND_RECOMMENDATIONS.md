# Notification System Audit - Executive Summary & Recommendations

## 📋 Audit Scope

**System:** Dynamic scheduling of Braze push notifications for football matches  
**Date:** December 4, 2025  
**Auditor:** AI Security Review  
**Codebase:** Supabase Edge Functions + PostgreSQL

---

## 🎯 Key Questions Answered

### 1. Can two notifications send at the same time for the same match?

**Answer: YES, but low probability in current production.**

**Scenarios where duplicates can occur:**

| Scenario | Probability | Protection Exists? | Severity |
|----------|-------------|-------------------|----------|
| Simultaneous scheduler runs (lock race) | Low | ✅ Yes (row-level locks) | Low |
| Post-run deduplication deletes wrong schedule | Very Low | ❌ No (flawed logic) | **🔴 Critical** |
| Race between scheduler and reconcile | Very Low | ✅ Partial (timing-dependent) | Medium |
| Manual Braze dashboard creation | Low | ✅ Yes (reconcile cancels) | Low |

**Overall Risk:** 🟠 **MEDIUM** (Low probability but HIGH impact if it occurs)

---

### 2. Are there gaps in knowing how many notifications are scheduled vs sent?

**Answer: YES, significant tracking gaps exist.**

**Identified Gaps:**

| Gap | Description | Impact | Detection Method |
|-----|-------------|--------|------------------|
| Missing dispatch_id/send_id | Ledger doesn't capture Braze send IDs | Webhook correlation failures | ❌ None |
| Time-based webhook correlation | 4-minute window can mis-attribute | Wrong match_id in logs | ❌ None |
| No count reconciliation | Never compare ledger count vs Braze count | Undetected duplicates | ❌ None |
| No per-user verification | Don't track expected vs actual send count | Can't verify audience | ❌ None |
| Webhook delivery not guaranteed | No fallback if webhook fails | Stale pending schedules | ✅ verify (reactive) |

**Overall Risk:** 🟠 **MEDIUM-HIGH** (Multiple gaps, limited visibility)

---

## 🔍 Critical Findings

### Finding 1: Post-Run Deduplication Logic is Flawed

**Location:** `supabase/functions/braze-scheduler/index.ts:635-708`

**Issue:** Can delete the CORRECT schedule and keep a duplicate.

**Root Cause:**
```typescript
// Process A creates schedule S1, updates ledger to S1
// Process B creates schedule S2, updates ledger to S2 (overwrites)
// Process A's deduplication runs, sees ledger shows S2
// Process A deletes S2 (thinking it's a duplicate)
// Result: S1 remains but ledger points to deleted S2
```

**Impact:** Missed notifications, broken ledger state

**Recommendation:** **🔴 REMOVE THIS CODE ENTIRELY**
- Lines 635-708 should be deleted
- Rely on unique constraint + pre-flight checks instead
- Post-run deduplication is unnecessary and dangerous

---

### Finding 2: Webhook Correlation Uses Risky Fallback

**Location:** `supabase/functions/braze-webhook/index.ts:118-150`

**Issue:** Time-based matching (4-minute window) can mis-attribute webhooks when multiple matches have identical kickoff times.

**Example:**
```
Match A: Real Madrid vs Barcelona, kickoff 15:00, send at 14:00
Match B: Manchester City vs Liverpool, kickoff 15:00, send at 14:00
Match C: Arsenal vs Chelsea, kickoff 15:00, send at 14:00

Webhook arrives at 14:00:23
Query finds all 3 matches (all within 4-minute window)
Picks closest one (Match A) by luck
Result: Match A gets webhook, B and C stay pending forever
```

**Impact:** Incorrect reporting, stale pending schedules

**Recommendation:** **🟠 ADD CONFIDENCE SCORING**
- Log low-confidence matches for manual review
- Alert when time-window matching is used
- See Fix #2 in TRACKING_GAPS_ANALYSIS.md

---

### Finding 3: No Count Verification Between Ledger and Braze

**Location:** System-wide gap

**Issue:** Never verify that `COUNT(schedule_ledger WHERE status='pending')` equals `COUNT(Braze schedules for our campaign)`.

**Impact:** Undetected duplicates can persist for days/weeks

**Recommendation:** **🟠 CREATE DAILY COUNT AUDIT**
- New edge function: `braze-count-audit`
- Runs daily at 2 AM (before reconcile at 3 AM)
- Logs count mismatches
- See Fix #3 in TRACKING_GAPS_ANALYSIS.md

---

### Finding 4: Lock Timeout Can Be Exceeded in Production

**Location:** Both `braze-scheduler` and `braze-reconcile`

**Current Setting:** `LOCK_TIMEOUT_MINUTES = 5`

**Issue:** Total runtime can exceed 5 minutes:
```
Translation API calls: 15s timeout × 20 teams = 300s (5 min)
Braze API calls: 2s × 100 matches = 200s (3.3 min)
Total: ~8 minutes worst case
```

**Impact:** Lock expires mid-run, allows concurrent execution

**Recommendation:** **🟡 INCREASE TIMEOUT TO 10 MINUTES**

```typescript
const LOCK_TIMEOUT_MINUTES = 10; // Increased from 5
```

---

## 📊 Risk Assessment Matrix

| Risk | Likelihood | Impact | Overall | Status |
|------|-----------|--------|---------|--------|
| Duplicate notifications sent | Low | High | **🟠 MEDIUM** | Partially mitigated |
| Webhook mis-attribution | Medium | Medium | **🟠 MEDIUM** | Unmitigated |
| Missed notifications (stale pending) | Low | High | **🟠 MEDIUM** | Detected late |
| Undetected duplicate schedules in Braze | Medium | Medium | **🟠 MEDIUM** | Unmitigated |
| Ledger-Braze desync | Low | Medium | **🟡 LOW-MEDIUM** | Reconciled daily |
| Lock race allows concurrent runs | Low | Low | **🟢 LOW** | Rare, recoverable |

---

## ✅ What's Working Well

The system has several strong protections:

1. ✅ **Unique constraint on `schedule_ledger.match_id`**
   - Prevents duplicate ledger entries at database level
   - PostgreSQL atomic operations are reliable

2. ✅ **Signature-based deduplication in reconcile**
   - Catches schedule drift
   - Cancels outdated schedules

3. ✅ **Match-based deduplication in reconcile**
   - Groups by match_id
   - Cancels duplicates daily

4. ✅ **Comprehensive logging**
   - `scheduler_logs` table tracks all operations
   - Good for debugging and audit trails

5. ✅ **Gap detection with auto-fix**
   - Finds missing schedules
   - Triggers scheduler to fix gaps

6. ✅ **Verification function**
   - Detects stale pending schedules
   - Compares ledger with Braze

7. ✅ **Lock mechanism**
   - Prevents most concurrent runs
   - Separate locks for scheduler and reconcile

---

## 🚨 Priority Fixes

### 🔴 PRIORITY 1: Remove Post-Run Deduplication (CRITICAL)

**File:** `supabase/functions/braze-scheduler/index.ts`  
**Lines to delete:** 635-708

**Rationale:**
- Logic is fundamentally flawed (can delete correct schedule)
- Unnecessary (unique constraint already prevents duplicates)
- Dangerous (race conditions with ledger updates)

**Impact of fix:**
- ✅ Eliminates critical race condition
- ✅ Simplifies codebase
- ✅ Relies on proven database constraints

**Testing:**
```bash
# Test 1: Verify unique constraint prevents duplicates
# Run scheduler twice concurrently for same match
# Expected: Second insert fails with unique constraint error

# Test 2: Verify reconcile still catches duplicates
# Manually create duplicate in Braze dashboard
# Run reconcile
# Expected: Duplicate is cancelled
```

---

### 🟠 PRIORITY 2: Increase Lock Timeout

**File:** Both `braze-scheduler/index.ts` and `braze-reconcile/index.ts`  
**Change:**

```typescript
const LOCK_TIMEOUT_MINUTES = 10; // Increased from 5
```

**Rationale:**
- Translation API: 15s timeout per team
- Braze API: 2s per match
- Buffer for network latency
- Total worst-case: ~8 minutes

**Testing:**
```bash
# Test 1: Simulate slow AI translation
# Mock translation API to return after 14s
# Verify scheduler completes without lock expiry

# Test 2: Load test with 200 matches
# Measure total runtime
# Verify runtime < 10 minutes
```

---

### 🟠 PRIORITY 3: Add Webhook Correlation Confidence Logging

**File:** `supabase/functions/braze-webhook/index.ts`  
**New code after line 150:**

```typescript
// Add confidence scoring
interface WebhookCorrelation {
  match_id: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'dispatch_id' | 'send_id' | 'time_exact' | 'time_window';
  time_diff_ms?: number;
}

let correlation: WebhookCorrelation;

if (matchId && dispatchId) {
  correlation = { match_id: matchId, confidence: 'high', method: 'dispatch_id' };
} else if (matchId && sendId) {
  correlation = { match_id: matchId, confidence: 'high', method: 'send_id' };
} else if (matchId && closestDiff < 10000) { // Within 10 seconds
  correlation = { match_id: matchId, confidence: 'medium', method: 'time_exact', time_diff_ms: closestDiff };
} else if (matchId) {
  correlation = { match_id: matchId, confidence: 'low', method: 'time_window', time_diff_ms: closestDiff };
} else {
  correlation = { match_id: 0, confidence: 'low', method: 'unknown' };
}

// Log low-confidence correlations
if (correlation.confidence === 'low') {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-webhook',
    action: 'low_confidence_correlation',
    reason: `Matched via ${correlation.method} with ${correlation.time_diff_ms}ms diff`,
    details: { 
      correlation,
      webhook_event: event,
      possible_matches: timeMatchedEntries?.length || 0
    },
  });
}
```

**Rationale:**
- Provides visibility into correlation quality
- Enables monitoring of mis-attribution risk
- Helps identify patterns in webhook issues

---

### 🟡 PRIORITY 4: Create Count Reconciliation Function

**New file:** `supabase/functions/braze-count-audit/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
  const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
  const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');

  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Count pending schedules in ledger
  const { count: ledgerCount } = await supabase
    .from('schedule_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gte('send_at_utc', now.toISOString());

  // Fetch Braze schedules
  const brazeRes = await fetch(
    `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(thirtyDaysOut.toISOString())}`,
    { method: 'GET', headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
  );

  const brazeData = await brazeRes.json();
  const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
    b.campaign_id === brazeCampaignId ||
    b.campaign_api_id === brazeCampaignId ||
    b.campaign_api_identifier === brazeCampaignId
  );

  const brazeCount = ourBroadcasts.length;
  const delta = brazeCount - (ledgerCount || 0);

  const report = {
    timestamp: now.toISOString(),
    ledger_pending: ledgerCount || 0,
    braze_actual: brazeCount,
    delta,
    status: delta === 0 ? 'in_sync' : 'mismatch',
  };

  // Log to scheduler_logs
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-count-audit',
    action: delta === 0 ? 'count_verified' : 'count_mismatch',
    reason: delta === 0 
      ? `Counts match: ${ledgerCount} schedules`
      : `Braze has ${Math.abs(delta)} ${delta > 0 ? 'more' : 'fewer'} schedules than ledger`,
    details: report,
  });

  console.log('Count audit:', report);

  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
```

**Cron job:** Add to migrations:

```sql
-- Run count audit daily at 2 AM (before reconcile at 3 AM)
SELECT cron.schedule(
  'braze-count-audit-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url:='https://YOUR_PROJECT.supabase.co/functions/v1/braze-count-audit',
    headers:='{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

---

## 🔧 Implementation Plan

### Phase 1: Quick Wins (1-2 days)

1. ✅ Remove post-run deduplication (Priority 1)
2. ✅ Increase lock timeout (Priority 2)
3. ✅ Deploy and monitor

**Success Criteria:**
- No scheduler errors related to deduplication
- No lock timeout errors in logs

---

### Phase 2: Enhanced Monitoring (3-5 days)

4. ✅ Add webhook correlation confidence logging (Priority 3)
5. ✅ Create count audit function (Priority 4)
6. ✅ Set up daily cron job

**Success Criteria:**
- Count audit runs daily without errors
- Low-confidence webhook correlations are logged
- Dashboard shows count trends

---

### Phase 3: Advanced Features (1-2 weeks)

7. ✅ Capture dispatch_id/send_id at send time (see TRACKING_GAPS Fix #1)
8. ✅ Add webhook health monitoring (see TRACKING_GAPS Fix #4)
9. ✅ Create admin dashboard for count audit results

**Success Criteria:**
- >95% of webhooks use high-confidence correlation
- Webhook health metrics tracked daily
- Admins can view count audit history

---

## 📈 Success Metrics

### Before Fixes

| Metric | Current Value | Issues |
|--------|---------------|--------|
| Duplicate notification rate | Unknown | No tracking |
| Webhook correlation method | 60% time-based (estimated) | Risky fallback |
| Count mismatch detection | Never | No checks |
| Lock timeout errors | ~1 per week (estimated) | Occasional |
| Stale pending schedules | Detected after 24h | Reactive |

### After Fixes (Target)

| Metric | Target Value | Improvement |
|--------|--------------|-------------|
| Duplicate notification rate | <0.1% | Monitored daily |
| Webhook correlation method | >95% high-confidence | Logged and tracked |
| Count mismatch detection | Daily | Proactive alerts |
| Lock timeout errors | 0 | Eliminated |
| Stale pending schedules | Detected within 1h | Proactive |

---

## 🧪 Testing Recommendations

### Test 1: Concurrent Scheduler Runs

```bash
# Terminal 1
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/braze-scheduler \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Terminal 2 (immediately after)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/braze-scheduler \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Expected: Second call returns "Already running"
# Expected: No duplicate schedules created
```

### Test 2: Same-Time Kickoffs

```sql
-- Create 3 matches with identical kickoff times
INSERT INTO matches (id, home_team, away_team, utc_date, competition, ...) VALUES
  (9001, 'Manchester City FC', 'Liverpool FC', '2025-12-07 15:00:00+00', 'PL', ...),
  (9002, 'Arsenal FC', 'Chelsea FC', '2025-12-07 15:00:00+00', 'PL', ...),
  (9003, 'Manchester United FC', 'Tottenham Hotspur FC', '2025-12-07 15:00:00+00', 'PL', ...);

-- Run scheduler
-- Expected: 3 schedules created with identical send_at_utc
-- Expected: Webhook correlation logs confidence scores
```

### Test 3: Count Audit Detects Duplicates

```bash
# Manually create duplicate schedule in Braze dashboard
# Run count audit
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/braze-count-audit \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"

# Expected: Returns { delta: 1, status: 'mismatch' }
# Expected: Log entry in scheduler_logs with action='count_mismatch'
```

### Test 4: Lock Timeout Under Load

```bash
# Mock translation API to always take 14 seconds
# Create 50 matches with no Arabic translations
# Run scheduler
# Expected: Completes within 10 minutes
# Expected: No lock timeout errors
```

---

## 📚 Additional Resources

- **SECURITY_AUDIT_FINDINGS.md** - Detailed technical analysis of race conditions
- **RACE_CONDITION_SCENARIOS.md** - Timeline visualizations of failure scenarios
- **TRACKING_GAPS_ANALYSIS.md** - Comprehensive tracking gap analysis

---

## 🎯 Conclusion

The notification scheduling system is **production-ready for current traffic levels** but requires the recommended fixes to scale safely and maintain data integrity.

**Immediate Action Items:**
1. 🔴 Remove post-run deduplication (Critical)
2. 🟠 Increase lock timeout (High)
3. 🟠 Add count reconciliation (High)

**Risk Level After Fixes:**
- Duplicate notifications: 🟢 **LOW** (down from MEDIUM)
- Tracking accuracy: 🟡 **MEDIUM** (down from MEDIUM-HIGH)
- System reliability: 🟢 **HIGH** (up from MEDIUM)

**Estimated Implementation Time:** 5-7 business days for all priority fixes

---

**Report prepared by:** AI Security Audit  
**Date:** December 4, 2025  
**Next review recommended:** After Phase 2 completion (30 days)

---
