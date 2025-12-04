# Braze Notification System Audit

## Executive Summary

This audit identified 11 potential issues in the Braze notification scheduling system. Most are **edge cases** rather than fundamental design flaws. The system has strong foundational protections including unique database constraints and signature-based deduplication.

## Critical Action Items

### ✅ COMPLETED: Remove Dangerous Post-Run Deduplication
- **File**: `supabase/functions/braze-scheduler/index.ts`
- **Lines**: 635-708 (now removed)
- **Risk**: Could delete CORRECT schedules during race conditions
- **Status**: ✅ Code removed, system now relies on unique constraint

### ✅ COMPLETED: Extended Lock Timeout
- **File**: `supabase/functions/braze-scheduler/index.ts` and `braze-reconcile/index.ts`
- **Change**: Lock timeout increased from 5 to 10 minutes
- **Reason**: Prevents concurrent runs when processing takes longer

### ✅ COMPLETED: Scheduler Conflict Check in Reconcile
- **File**: `supabase/functions/braze-reconcile/index.ts`
- **Change**: Added check to skip reconcile if scheduler is actively running
- **Reason**: Prevents race conditions between functions

### ✅ COMPLETED: Count Reconciliation Function
- **File**: `supabase/functions/reconcile-counts/index.ts`
- **Purpose**: Compares ledger vs Braze counts to detect discrepancies

## Risk Assessment After Fixes

| Risk Category | Previous State | Current State |
|--------------|----------------|---------------|
| Duplicate notifications | 🟠 MEDIUM | 🟢 LOW |
| Tracking accuracy | 🟠 MEDIUM-HIGH | 🟢 LOW |
| System reliability | 🟡 MEDIUM | 🟢 LOW |

## What's Working Well ✅

1. **Unique constraint** on `match_id` prevents database-level duplicates
2. **Signature-based deduplication** in reconcile function
3. **Comprehensive logging** in `scheduler_logs` table
4. **Gap detection** with auto-fix capability
5. **Pre-send verification** recreates missing schedules
6. **Webhook tracking** updates ledger status to 'sent'
7. **Stale pending alerts** detect missed notifications

## Monitoring Checklist

Run these checks daily:

1. **AlertMonitor Dashboard**: Check for:
   - Stale pending schedules (CRITICAL)
   - Missing from Braze alerts
   - Timing issues

2. **Count Reconciliation**: Call `reconcile-counts` function to verify:
   - Ledger count matches Braze count
   - No orphaned schedules
   - No duplicate matches

3. **Pre-Send Verification**: Runs automatically to recreate missing schedules

## Quick Reference

| Function | Purpose | Trigger |
|----------|---------|---------|
| `braze-scheduler` | Create/update schedules | Cron (every 5 min) |
| `braze-reconcile` | Clean up orphans | Cron (daily) |
| `pre-send-verification` | Recreate missing | Cron (every 10 min) |
| `verify-braze-schedules` | Full verification | Manual |
| `reconcile-counts` | Count comparison | Manual/Cron |
| `gap-detection` | Find unscheduled matches | Cron (every 5 min) |

## Documentation Files

1. `AUDIT_README.md` - This file (executive overview)
2. `QUICK_REFERENCE_GUIDE.md` - Developer cheat sheet
3. `SECURITY_AUDIT_FINDINGS.md` - Detailed technical analysis
4. `RACE_CONDITION_SCENARIOS.md` - Timeline visualizations
5. `TRACKING_GAPS_ANALYSIS.md` - Data flow analysis
