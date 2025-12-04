# Security Audit Findings

## Issue Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Post-run deduplication race condition | 🔴 CRITICAL | ✅ FIXED |
| 2 | Lock timeout too short | 🟠 MEDIUM | ✅ FIXED |
| 3 | Scheduler/Reconcile race condition | 🟠 MEDIUM | ✅ FIXED |
| 4 | Missing dispatch_id/send_id storage | 🟠 MEDIUM | ✅ ALREADY EXISTS |
| 5 | Time-based webhook correlation | 🟡 LOW | ACCEPTABLE |
| 6 | No count reconciliation | 🟠 MEDIUM | ✅ FIXED |
| 7 | No per-user verification | 🟡 LOW | OUT OF SCOPE |

---

## Issue #1: Post-Run Deduplication Race Condition

**Severity**: 🔴 CRITICAL  
**Status**: ✅ FIXED

### Problem
The `braze-scheduler` function contained post-run deduplication logic (lines 635-708) that could delete the CORRECT schedule during race conditions.

### How It Happened
1. Scheduler A creates schedule S1 for match M
2. Scheduler B starts before A completes
3. Scheduler A runs dedup, sees S1 as "not in ledger yet"
4. Scheduler A deletes S1 from Braze
5. S1 was actually the correct schedule

### Fix
Removed the dangerous code. The unique database constraint on `match_id` already prevents duplicates at the source.

---

## Issue #2: Lock Timeout Too Short

**Severity**: 🟠 MEDIUM  
**Status**: ✅ FIXED

### Problem
5-minute lock timeout could be exceeded when processing many matches with translation generation.

### Fix
Extended lock timeout to 10 minutes in both `braze-scheduler` and `braze-reconcile`.

---

## Issue #3: Scheduler/Reconcile Race Condition

**Severity**: 🟠 MEDIUM  
**Status**: ✅ FIXED

### Problem
If reconcile runs while scheduler is active, it could cancel schedules that are being created.

### Fix
Added check in `braze-reconcile` to skip execution if scheduler lock is active.

---

## Issue #4: Missing dispatch_id/send_id Storage

**Severity**: 🟠 MEDIUM  
**Status**: ✅ ALREADY EXISTS

### Analysis
The code already stores `dispatch_id` and `send_id` from Braze API responses in the `schedule_ledger` table. No additional changes needed.

---

## Issue #5: Time-Based Webhook Correlation

**Severity**: 🟡 LOW  
**Status**: ACCEPTABLE

### Problem
When webhooks don't include `match_id`, the system falls back to time-based correlation (2-minute window). This can mis-attribute webhooks when multiple matches kick off simultaneously.

### Mitigation
- Primary correlation uses `dispatch_id` and `send_id` from the webhook
- Time-based is fallback only
- Risk is low since simultaneous kickoffs are rare

---

## Issue #6: No Count Reconciliation

**Severity**: 🟠 MEDIUM  
**Status**: ✅ FIXED

### Problem
No way to verify that the number of schedules in ledger matches Braze.

### Fix
Created `reconcile-counts` function that:
- Compares pending ledger count vs Braze schedule count
- Identifies orphaned schedules in Braze
- Identifies schedules missing from Braze
- Detects duplicate schedules for same match
- Logs discrepancies

---

## Issue #7: No Per-User Verification

**Severity**: 🟡 LOW  
**Status**: OUT OF SCOPE

### Problem
Cannot verify how many individual users actually received notifications.

### Analysis
This would require Braze message activity export or Currents, which is outside the scope of this system. The webhook provides one event per user, so `notification_sends` count gives approximate user delivery count.

---

## Recommendations for Future Improvement

1. **Add Braze Currents integration** for comprehensive delivery tracking
2. **Implement retry logic** for failed schedule creations
3. **Add email alerts** for critical issues (stale pending, missing schedules)
4. **Create monitoring dashboard** with real-time health status
