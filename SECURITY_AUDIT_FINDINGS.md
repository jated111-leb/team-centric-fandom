# Notification Scheduling System - Security Audit Findings

**Date:** December 4, 2025  
**Scope:** Dynamic scheduling system for Braze push notifications

## Executive Summary

This audit identified **4 CRITICAL ISSUES** that could lead to duplicate notifications being sent, and **3 SIGNIFICANT TRACKING GAPS** that prevent accurate reconciliation between scheduled and sent notifications.

---

## 🚨 CRITICAL ISSUES - Duplicate Notification Risks

### 1. **RACE CONDITION IN SCHEDULE CREATION (HIGH SEVERITY)**

**Location:** `braze-scheduler/index.ts` lines 509-616

**Problem:** The reservation system has a race condition window.

**Current Flow:**
```typescript
// STEP 1: Reserve slot in ledger
const { error: insertError } = await supabase
  .from('schedule_ledger')
  .insert({
    match_id: match.id,
    braze_schedule_id: `pending-${reservationId}`, // Temporary placeholder
    signature,
    send_at_utc: sendAtDate.toISOString(),
    status: 'pending',
  });

// STEP 2: Call Braze API (LONG NETWORK CALL - RACE WINDOW)
const createRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/create`, ...);

// STEP 3: Update with real schedule ID
await supabase.from('schedule_ledger').update({
  braze_schedule_id: createData.schedule_id,
  ...
})
```

**Race Condition Scenario:**
1. Process A reserves slot for Match 123, gets `pending-abc123`
2. Process A calls Braze API (takes 2-5 seconds)
3. **During this time**, Process B tries to schedule same match
4. Process B sees `pending-abc123` in ledger (line 379-384)
5. Process B's check at line 403: `existingSchedule.signature === signature` 
6. But signature MIGHT be different if kickoff time was updated slightly
7. Process B could attempt to update instead of skip
8. **RESULT:** Two Braze schedules created for the same match

**Evidence:**
- Unique constraint only on `match_id` WHERE status IN ('pending', 'sent')
- But the initial insert uses a temporary `braze_schedule_id` 
- No atomic "check-and-create" operation with Braze

**Impact:** Users receive duplicate notifications for the same match.

---

### 2. **POST-RUN DEDUPLICATION LOGIC FLAW (MEDIUM SEVERITY)**

**Location:** `braze-scheduler/index.ts` lines 635-708

**Problem:** The post-run deduplication can delete the WRONG schedule.

**Current Logic:**
```typescript
for (const [matchId, schedules] of byMatchId.entries()) {
  if (schedules.length <= 1) continue;
  
  // Fetch ledger entry
  const { data: ledgerEntry } = await supabase
    .from('schedule_ledger')
    .select('braze_schedule_id')
    .eq('match_id', parseInt(matchId))
    .maybeSingle();
  
  for (const schedule of schedules) {
    // Keep the one that matches our ledger
    if (ledgerEntry && schedule.schedule_id === ledgerEntry.braze_schedule_id) {
      continue; // Keep this one
    }
    
    // Cancel all others
    await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/delete`, ...);
  }
}
```

**Race Condition Scenario:**
1. At T=0: Process A creates schedule S1 for Match 123, ledger shows S1
2. At T=1: Process B (running concurrently) also creates schedule S2 for Match 123
3. At T=2: Process B updates ledger to S2 (overwrites S1's placeholder)
4. At T=3: Process A's post-run deduplication runs
5. Process A sees ledger shows S2, but Process A created S1
6. **Process A deletes S2 (the correct one!), keeps S1 (its own creation)**
7. At T=4: Process B's post-run deduplication runs
8. Process B sees ledger shows S2, tries to keep S2
9. **But S2 was already deleted by Process A!**
10. **RESULT:** Either NO notification or an orphaned schedule

**Impact:** Critical - correct schedules can be deleted, leading to missed notifications.

---

### 3. **UNIQUE CONSTRAINT DOESN'T PREVENT DUPLICATES DURING UPDATES (MEDIUM SEVERITY)**

**Location:** Migration `20251203130445` and `braze-scheduler/index.ts`

**Problem:** The unique constraint only applies to final state, not during transitions.

**Current Constraint:**
```sql
CREATE UNIQUE INDEX schedule_ledger_match_pending_unique 
ON schedule_ledger (match_id) 
WHERE status IN ('pending', 'sent');
```

**Scenario:**
1. Match 123 has existing schedule with status='pending', braze_schedule_id='real-123'
2. Scheduler runs, decides to UPDATE this schedule (line 402-508)
3. During update, signature check passes (line 404)
4. But update buffer check might fail in parallel execution
5. Meanwhile, another process could insert with `pending-{uuid}` 
6. Both processes call Braze API
7. **RESULT:** Two active Braze schedules, but ledger only tracks one

**Why constraint doesn't help:**
- The temporary `pending-{uuid}` satisfies uniqueness initially
- The real schedule_id update happens AFTER Braze API call
- No database-level atomicity with external Braze API

---

### 4. **NO PROTECTION AGAINST CONCURRENT RECONCILIATION DELETES (LOW-MEDIUM SEVERITY)**

**Location:** `braze-reconcile/index.ts` lines 134-201

**Problem:** Reconcile can delete schedules that scheduler just created.

**Scenario:**
1. T=0: Scheduler creates schedule S1 for Match 123, inserts ledger with `pending-abc`
2. T=1: Scheduler calls Braze API (in progress...)
3. T=2: **Reconcile job runs** (daily at 3 AM, but also manual triggers)
4. T=3: Reconcile fetches Braze schedules - **S1 doesn't appear yet** (API race)
5. T=4: Reconcile checks ledger - sees `pending-abc` but **not in Braze list**
6. T=5: Reconcile marks as orphan and cancels... **but S1 is still being created!**
7. T=6: Scheduler updates ledger with real ID, but **Braze schedule already cancelled**
8. **RESULT:** Notification never sends despite being in ledger as 'pending'

**Current Lock Mechanism:**
- Locks are separate: `braze-scheduler` uses lock key, `braze-reconcile` uses different key
- They DON'T block each other
- This is by design but creates race conditions

---

## 📊 TRACKING GAPS - Schedule vs Send Reconciliation

### 5. **WEBHOOK CORRELATION IS PROBABILISTIC (HIGH SEVERITY)**

**Location:** `braze-webhook/index.ts` lines 96-171

**Problem:** Webhook matching uses fallback strategies that can mis-attribute notifications.

**Current Matching Logic:**
```typescript
// Strategy 1: Try dispatch_id/send_id (BEST)
if (dispatchId || sendId) {
  // ... lookup in schedule_ledger
}

// Strategy 2: TIME-BASED CORRELATION (DANGEROUS)
if (!matchId) {
  const windowStart = new Date(sentAtTime.getTime() - 2 * 60 * 1000); // 2 min before
  const windowEnd = new Date(sentAtTime.getTime() + 2 * 60 * 1000); // 2 min after
  
  const { data: timeMatchedEntries } = await supabase
    .from('schedule_ledger')
    .select('match_id, send_at_utc')
    .gte('send_at_utc', windowStart)
    .lte('send_at_utc', windowEnd)
    .in('status', ['pending', 'sent']);
}
```

**Why This Is Dangerous:**
1. If two matches have kickoffs within 4 minutes (e.g., 3:00 PM and 3:02 PM)
2. Both generate notifications at kickoff-60min (2:00 PM and 2:02 PM)
3. A webhook for Match A at 2:01 PM could match EITHER schedule
4. **Closest match wins** but this is probabilistic, not deterministic

**Real-World Scenario:**
- Premier League often schedules multiple matches at 3:00 PM on Saturdays
- All notifications would send at 2:00 PM
- Webhooks could be mis-attributed

**Impact:** 
- `notification_sends` table has wrong `match_id`
- Reporting shows wrong teams/matches
- **Schedule ledger status updates are incorrect** (one marked 'sent', other stays 'pending')

---

### 6. **NO AUDIT TRAIL FOR BRAZE API SCHEDULE COUNTS (MEDIUM SEVERITY)**

**Problem:** We never verify that the Braze API schedule count matches our ledger count.

**Current State:**
- `schedule_ledger` tracks what WE THINK is scheduled
- `notification_sends` tracks what WAS SENT (via webhooks)
- `verify-braze-schedules` checks existence but **not counts**

**Missing Reconciliation:**
```typescript
// We should have this check but DON'T:
const ledgerCount = await supabase
  .from('schedule_ledger')
  .select('*', { count: 'exact' })
  .eq('status', 'pending')
  .gte('send_at_utc', now);

const brazeCount = await fetchBrazeScheduleCount(campaignId);

if (ledgerCount !== brazeCount) {
  // ALERT: Mismatch detected!
  // Either: (a) Braze has duplicates, or (b) Some schedules failed to create
}
```

**Current Gaps:**
1. `braze-reconcile` cancels orphans but doesn't log the COUNT before/after
2. `verify-braze-schedules` checks individual schedules but no aggregate count
3. No daily report showing: "Expected 150 schedules, Braze shows 153, +3 duplicates detected"

---

### 7. **DISPATCH_ID AND SEND_ID ARE NOT ALWAYS CAPTURED (MEDIUM SEVERITY)**

**Location:** Multiple places

**Problem:** The webhook correlation relies on `dispatch_id` and `send_id`, but:

1. **In scheduler CREATE flow (line 576):**
```typescript
const createData = await createRes.json();
await supabase.from('schedule_ledger').update({
  braze_schedule_id: createData.schedule_id,
  dispatch_id: createData.dispatch_id || null,  // ⚠️ Might be null!
  send_id: createData.send_id || null,           // ⚠️ Might be null!
})
```

2. **Braze API may not return these immediately**
   - They're generated when the schedule is triggered (at send time)
   - Our ledger stores `null` initially
   - **Never updated when Braze actually assigns them**

3. **Webhook uses these for correlation (line 94-116)**
   - If ledger has `null`, Strategy 1 fails
   - Falls back to Strategy 2 (time-based, risky)

**Impact:**
- Webhook correlation is less reliable than documented
- Time-based fallback increases mis-attribution risk

---

## 🔍 ADDITIONAL OBSERVATIONS

### 8. **Lock Timeout Could Allow Concurrent Execution (LOW SEVERITY)**

**Location:** Both `braze-scheduler` and `braze-reconcile`

```typescript
const LOCK_TIMEOUT_MINUTES = 5;

const { data: lockResult, error: lockError } = await supabase
  .from('scheduler_locks')
  .update({ ... })
  .eq('lock_name', 'braze-scheduler')
  .or(`locked_at.is.null,expires_at.lt.${new Date().toISOString()}`);
```

**Scenario:**
1. Process A acquires lock at 2:00 PM, expires at 2:05 PM
2. Process A gets stuck on AI translation API call (15s timeout each, line 186)
3. If 10 teams need translation: 10 × 15s = 150s = 2.5 minutes
4. Add Braze API calls: 100 matches × 2s = 200s = 3.3 minutes
5. **Total runtime: ~6 minutes**
6. Process B starts at 2:06 PM, sees expired lock, **runs concurrently**

**Current Mitigation:**
- Lock released in `finally` block (good!)
- But if process crashes/hangs, lock expires and allows concurrent run

---

### 9. **Gap Detection Auto-Fix Can Trigger Infinite Loop (LOW SEVERITY)**

**Location:** `gap-detection/index.ts` lines 126-150

```typescript
if (gaps.length > 0) {
  console.log(`🔧 AUTO-FIX: Triggering braze-scheduler to fix ${gaps.length} gaps...`);
  const { data: schedulerResult } = await supabase.functions.invoke('braze-scheduler');
}
```

**Problem:**
1. Gap detection finds 5 missing schedules
2. Triggers scheduler auto-fix
3. Scheduler runs but fails to create some schedules (e.g., translation timeout)
4. Gap still exists
5. If gap-detection is run again immediately... **triggers scheduler again**
6. No cooldown or rate limiting

**Potential Impact:**
- Excessive Braze API calls
- Cost implications
- Rate limiting from Braze

---

## 📋 RECOMMENDED FIXES

### Fix Priority 1: Atomic Schedule Creation

**Replace the two-step creation with a distributed lock:**

```typescript
// Use a match-specific lock for atomic schedule creation
const matchLockKey = `schedule_match_${match.id}`;
const { data: matchLock } = await supabase
  .from('scheduler_locks')
  .insert({ 
    lock_name: matchLockKey,
    locked_by: lockId,
    expires_at: new Date(Date.now() + 30000).toISOString() 
  })
  .select()
  .maybeSingle();

if (!matchLock) {
  console.log(`Match ${match.id} is being scheduled by another process - skipping`);
  skipped++;
  continue;
}

try {
  // Now safe to proceed with check-create-update flow
  // ...
} finally {
  // Release match lock
  await supabase.from('scheduler_locks').delete().eq('lock_name', matchLockKey);
}
```

### Fix Priority 2: Remove Post-Run Deduplication

**The post-run deduplication logic is flawed and unnecessary if Fix #1 is implemented.**

Remove lines 635-708 from `braze-scheduler/index.ts`. Rely on:
1. Pre-flight check (line 379-384) - already exists
2. Unique constraint on `match_id` 
3. Match-specific locks (new from Fix #1)

### Fix Priority 3: Enhance Webhook Correlation

**Add a webhook matching confidence score:**

```typescript
interface WebhookMatch {
  match_id: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'dispatch_id' | 'send_id' | 'time_exact' | 'time_window';
}

// Log low-confidence matches for audit
if (confidence === 'low') {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-webhook',
    action: 'low_confidence_match',
    reason: `Matched via ${method} with ${confidence} confidence`,
    details: { ... },
  });
}
```

### Fix Priority 4: Add Count Reconciliation

**Create a new edge function `braze-count-reconcile` that runs daily:**

```typescript
// Fetch expected count
const { count: ledgerPending } = await supabase
  .from('schedule_ledger')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'pending')
  .gte('send_at_utc', now);

// Fetch actual count from Braze
const brazeSchedules = await fetchBrazeSchedules(campaignId);
const brazeCount = brazeSchedules.length;

const delta = brazeCount - ledgerPending;

if (delta !== 0) {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-count-reconcile',
    action: 'count_mismatch',
    reason: `Braze has ${delta > 0 ? 'more' : 'fewer'} schedules than expected`,
    details: { 
      expected: ledgerPending, 
      actual: brazeCount, 
      delta 
    },
  });
}
```

### Fix Priority 5: Capture dispatch_id/send_id at Send Time

**Add a scheduled job to update dispatch_id/send_id before notifications send:**

```typescript
// Run 10 minutes before each scheduled send
// Fetch updated schedule details from Braze
const brazeSchedule = await fetch(`${brazeEndpoint}/messages/scheduled_broadcasts/...`);
const { dispatch_id, send_id } = brazeSchedule;

await supabase
  .from('schedule_ledger')
  .update({ dispatch_id, send_id })
  .eq('braze_schedule_id', scheduleId);
```

---

## 📈 RISK ASSESSMENT

| Issue | Likelihood | Impact | Risk Level |
|-------|-----------|--------|-----------|
| Race condition in schedule creation | **MEDIUM** (runs every 15 min) | **HIGH** (duplicate notifications) | **🔴 CRITICAL** |
| Post-run deduplication deletes correct schedule | **LOW** (requires specific timing) | **CRITICAL** (missed notifications) | **🟠 HIGH** |
| Webhook mis-attribution | **MEDIUM** (depends on match timing) | **MEDIUM** (wrong reporting) | **🟠 MEDIUM** |
| No count reconciliation | **HIGH** (no checks exist) | **MEDIUM** (undetected duplicates) | **🟠 MEDIUM** |
| Missing dispatch_id/send_id | **HIGH** (Braze API behavior) | **MEDIUM** (fallback to risky matching) | **🟡 MEDIUM** |

---

## ✅ POSITIVE FINDINGS

The system DOES have several strong protections:
1. ✅ Signature-based deduplication in reconcile
2. ✅ Match-based deduplication in reconcile  
3. ✅ Comprehensive logging in `scheduler_logs`
4. ✅ Lock mechanism prevents most concurrent runs
5. ✅ Gap detection finds missing schedules
6. ✅ Verification function detects stale pending schedules

**However**, these protections are NOT sufficient to prevent all duplicate notification scenarios.

---

## 🎯 CONCLUSION

The notification scheduling system is **production-ready for LOW-TRAFFIC scenarios** but has **CRITICAL RACE CONDITIONS** that become more likely as scheduling frequency increases.

**Immediate Actions Required:**
1. Implement match-specific locks (Fix Priority 1)
2. Remove or fix post-run deduplication (Fix Priority 2)
3. Add count reconciliation monitoring (Fix Priority 4)

**Medium-Term Actions:**
4. Enhance webhook correlation (Fix Priority 3)
5. Capture dispatch_id/send_id properly (Fix Priority 5)
6. Add rate limiting to gap detection auto-fix

**Recommended Testing:**
- Simulate concurrent scheduler runs (2+ processes)
- Test with matches scheduled at identical times (e.g., 3:00 PM kickoffs)
- Load test: 1000+ matches, 100+ featured team matches
- Chaos test: Kill scheduler mid-execution, verify recovery

---

**Report End**
