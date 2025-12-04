# Tracking Gaps Analysis

## Data Flow Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│    matches      │────▶│  braze-scheduler │────▶│  Braze API      │
│    (source)     │     │                  │     │  (external)     │
└─────────────────┘     └────────┬─────────┘     └────────┬────────┘
                                 │                        │
                                 ▼                        │
                        ┌──────────────────┐              │
                        │  schedule_ledger │              │
                        │  (tracking)      │              │
                        └────────┬─────────┘              │
                                 │                        │
                                 │    ┌───────────────────┘
                                 │    │ Webhook
                                 ▼    ▼
                        ┌──────────────────┐
                        │ braze-webhook    │
                        │ (confirmation)   │
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ notification_    │
                        │ sends (audit)    │
                        └──────────────────┘
```

## Tracking Points

### 1. Schedule Creation ✅
**Location**: `schedule_ledger` table  
**Data captured**:
- `match_id` - Which match
- `braze_schedule_id` - Braze's identifier
- `signature` - Deduplication key
- `send_at_utc` - When notification will send
- `status` - pending/sent/cancelled
- `dispatch_id` - Braze correlation ID
- `send_id` - Braze send identifier

### 2. Schedule Updates ✅
**Location**: `scheduler_logs` table  
**Actions logged**:
- `created` - New schedule created
- `updated` - Existing schedule modified
- `skipped_unchanged` - No changes needed
- `skipped` - Missed window or other skip reason
- `error` - Failed operation

### 3. Webhook Receipt ✅
**Location**: `notification_sends` table  
**Data captured**:
- Per-user delivery confirmation
- Event type (send, click, etc.)
- Correlation to match_id
- Raw Braze payload

### 4. Status Tracking ✅
**Location**: `schedule_ledger.status`  
**Flow**:
```
pending ─────────────────▶ sent (webhook received)
   │
   └──────────────────────▶ cancelled (manual/reconcile)
```

## Gap Analysis

### Gap 1: Missing Braze Schedules
**Problem**: A schedule exists in ledger but not in Braze  
**Detection**: `verify-braze-schedules` function  
**Resolution**: `pre-send-verification` recreates missing schedules

### Gap 2: Orphaned Braze Schedules
**Problem**: A schedule exists in Braze but not in ledger  
**Detection**: `braze-reconcile` function  
**Resolution**: Automatically cancelled by reconcile

### Gap 3: Count Mismatch
**Problem**: Ledger count ≠ Braze count  
**Detection**: `reconcile-counts` function  
**Resolution**: Manual investigation required

### Gap 4: Stale Pending
**Problem**: send_at_utc passed but status still 'pending'  
**Detection**: `AlertMonitor` component, `verify-braze-schedules`  
**Resolution**: Manual investigation - notification may not have sent

### Gap 5: Duplicate Schedules
**Problem**: Multiple Braze schedules for same match  
**Detection**: `reconcile-counts` function  
**Resolution**: `braze-dedupe-fixtures` or `braze-reconcile`

## Monitoring Dashboard

The `AlertMonitor` component displays:

1. **Stale Pending Schedules** (CRITICAL)
   - Past send time, no webhook received
   - Requires immediate investigation

2. **Missing from Braze**
   - Future schedules not found in Braze
   - Auto-fixed by pre-send-verification

3. **Timing Issues**
   - Notifications not scheduled 60min before kickoff
   - May indicate data issues

4. **Recent Errors**
   - Failed API calls
   - Translation failures

## Verification Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Continuous Monitoring                        │
├──────────────────┬──────────────────┬──────────────────────────┤
│   Every 5 min    │   Every 10 min   │       Daily              │
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌────────────────────┐   │
│ │gap-detection │ │ │pre-send-     │ │ │braze-reconcile     │   │
│ │              │ │ │verification  │ │ │                    │   │
│ │Finds matches │ │ │              │ │ │Cleans orphans      │   │
│ │without       │ │ │Verifies      │ │ │Updates stale       │   │
│ │schedules     │ │ │schedules     │ │ │status              │   │
│ │              │ │ │exist, fixes  │ │ │                    │   │
│ │              │ │ │missing       │ │ │                    │   │
│ └──────────────┘ │ └──────────────┘ │ └────────────────────┘   │
├──────────────────┴──────────────────┴──────────────────────────┤
│                      Manual Triggers                            │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐   │
│ │Full Verify     │ │Reconcile Count │ │Pre-Send Check      │   │
│ │                │ │                │ │                    │   │
│ │Comprehensive   │ │Compares        │ │Verifies upcoming   │   │
│ │audit of all    │ │ledger vs Braze │ │schedules exist     │   │
│ │schedules       │ │counts          │ │                    │   │
│ └────────────────┘ └────────────────┘ └────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```
