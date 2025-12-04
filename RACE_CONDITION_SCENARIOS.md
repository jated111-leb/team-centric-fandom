# Race Condition Scenarios

This document visualizes potential race conditions that have been identified and fixed.

## Scenario 1: Post-Run Deduplication Deleting Correct Schedule (FIXED)

```
Timeline:
T0     T1           T2              T3             T4
|      |            |               |              |
v      v            v               v              v
┌──────────────────────────────────────────────────────────┐
│ Scheduler A starts                                       │
│ - Acquires lock                                          │
│ - Creates schedule S1 for match M                        │
│ - Inserts to ledger with pending-XXX placeholder         │
│                                                          │
│        [Meanwhile: Lock expires at T1]                   │
│                                                          │
│                    Scheduler B starts                    │
│                    - Acquires lock (A's expired)         │
│                    - Sees match M has pending schedule   │
│                    - Skips (correct behavior)            │
│                                                          │
│                                   Scheduler A continues  │
│                                   - Updates ledger with  │
│                                     real schedule_id     │
│                                   - Runs POST-RUN DEDUP  │
│                                   - Fetches Braze list   │
│                                   - Sees S1 in Braze     │
│                                   - Queries ledger for   │
│                                     match M              │
│                                                          │
│                                              S1 DELETED! │
│                                              (ledger was │
│                                              stale)      │
└──────────────────────────────────────────────────────────┘

RESULT: Match M notification never sent

FIX: Removed post-run deduplication entirely. Unique constraint prevents duplicates.
```

## Scenario 2: Lock Timeout Exceeded (FIXED)

```
Timeline:
T0        T5min      T6min
|         |          |
v         v          v
┌──────────────────────────────────────────────────────────┐
│ Scheduler A starts                                       │
│ - Acquires 5-minute lock                                 │
│ - Processing 50 matches with translations                │
│ - AI translation calls taking 15s each                   │
│                                                          │
│           Lock expires (5 min)                           │
│                                                          │
│                      Scheduler B starts                  │
│                      - Acquires lock (A's expired)       │
│                      - Starts processing same matches    │
│                      - Creates duplicate schedules!      │
│                                                          │
│                      Scheduler A still running...        │
│                      - Also creating schedules           │
│                      - Race condition!                   │
└──────────────────────────────────────────────────────────┘

FIX: Extended lock timeout to 10 minutes
```

## Scenario 3: Scheduler vs Reconcile Conflict (FIXED)

```
Timeline:
T0        T1         T2          T3
|         |          |           |
v         v          v           v
┌──────────────────────────────────────────────────────────┐
│ Scheduler starts                                         │
│ - Acquires scheduler lock                                │
│ - Reserves ledger slot for match M                       │
│ - Calls Braze API (slow response)                        │
│                                                          │
│           Reconcile starts (different lock)              │
│           - Acquires reconcile lock                      │
│           - Fetches Braze schedules                      │
│           - Sees schedule S1 for match M                 │
│           - Checks ledger: pending-XXX found             │
│           - S1 not in ledger yet!                        │
│           - CANCELS S1 as "orphan"                       │
│                                                          │
│                      Scheduler continues                 │
│                      - Gets Braze response               │
│                      - Updates ledger with S1            │
│                      - But S1 is already cancelled!      │
└──────────────────────────────────────────────────────────┘

FIX: Reconcile now checks if scheduler lock is active before running
```

## Scenario 4: Concurrent Schedule Creation (PROTECTED)

```
Timeline:
T0        T0+100ms   T0+200ms
|         |          |
v         v          v
┌──────────────────────────────────────────────────────────┐
│ Request A: Create schedule for match M                   │
│ - INSERT to ledger (match_id=M)                          │
│                                                          │
│           Request B: Create schedule for match M         │
│           - INSERT to ledger (match_id=M)                │
│           - UNIQUE CONSTRAINT VIOLATION                  │
│           - Request B aborted (correct!)                 │
│                                                          │
│                      Request A continues                 │
│                      - Creates in Braze                  │
│                      - Updates ledger                    │
│                      - SUCCESS                           │
└──────────────────────────────────────────────────────────┘

PROTECTION: Unique constraint on match_id prevents duplicates at database level
```

## Summary of Protections

| Protection | Purpose | Implementation |
|------------|---------|----------------|
| Unique constraint | Prevent duplicate ledger entries | Database constraint on match_id |
| Scheduler lock | Prevent concurrent scheduler runs | scheduler_locks table |
| Reconcile lock | Prevent concurrent reconcile runs | scheduler_locks table |
| Cross-lock check | Prevent scheduler/reconcile conflicts | Reconcile checks scheduler lock |
| Extended timeout | Allow time for AI translations | 10-minute lock timeout |
| Reservation pattern | Atomic create-then-update | Insert pending-XXX, then update |
