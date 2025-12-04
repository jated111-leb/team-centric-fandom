# Race Condition Scenarios - Detailed Timeline Analysis

## Scenario 1: Concurrent Schedule Creation Race

### Timeline Visualization

```
Time    Process A (Scheduler Run #1)           Process B (Scheduler Run #2)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires global lock                    [Waiting for lock]
        lockId = "aaa-111"

T=1     Fetches Match 123 details
        home: "Real Madrid CF"
        away: "FC Barcelona"
        kickoff: 2025-12-05 15:00 UTC

T=2     Checks schedule_ledger                  [Still waiting]
        → No existing schedule found

T=3     INSERT into schedule_ledger
        ✓ match_id: 123
        ✓ braze_schedule_id: "pending-aaa"
        ✓ signature: "2025-12-05T14:00|Real Madrid+Barcelona"
        ✓ status: 'pending'

T=4     Calls Braze API create...               [Still waiting]
        → Network request in flight (slow)

T=5     [Waiting for Braze response]            [Still waiting]

T=6     [Waiting for Braze response]            Process A's lock expires!
                                                 (Lock timeout = 5 min assumed hit)

T=7     [Waiting for Braze response]            Acquires lock (expired)
                                                 lockId = "bbb-222"

T=8     [Waiting for Braze response]            Fetches Match 123 details
                                                 (same match as Process A)

T=9     Braze API responds:                     Checks schedule_ledger
        ✓ schedule_id: "real-schedule-AAA"     → FINDS existing schedule!
        ✓ dispatch_id: "disp-AAA"                  match_id: 123
                                                    braze_schedule_id: "pending-aaa"
                                                    signature: "2025-12-05T14:00|Real Madrid+Barcelona"

T=10    UPDATE schedule_ledger                  Signature comparison:
        SET braze_schedule_id = "real-AAA"     existingSchedule.signature === signature?
        WHERE match_id = 123                    → TRUE ✓

T=11    ✓ Log: "created" action                 Decides to SKIP (unchanged)
        scheduled++                             skipped++

T=12    Continues to next match...              Continues to next match...

T=13    Releases lock                           Releases lock
```

### ✅ Outcome: SAFE (Process B correctly skipped)

This scenario is PROTECTED because:
1. Process A completed the ledger insert BEFORE Process B checked
2. Signature matched exactly
3. Process B correctly skipped the duplicate

---

## Scenario 2: Race with Kickoff Time Update

### Setup
- Match 123 was previously scheduled for 15:00
- Football-Data API returns updated kickoff time: 15:05 (5 min delay)
- Process A processes the update
- Process B runs concurrently

### Timeline Visualization

```
Time    Process A (Scheduler Run #1)           Process B (Scheduler Run #2)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires lock                           [Waiting]

T=1     Fetches Match 123 details
        kickoff: 2025-12-05 15:05 UTC (NEW!)
        Previous was: 15:00

T=2     Checks schedule_ledger                  [Waiting]
        → Finds existing schedule:
           braze_schedule_id: "real-schedule-OLD"
           signature: "2025-12-05T14:00|Real Madrid+Barcelona"
           send_at_utc: "2025-12-05T14:00"

T=3     Calculates NEW signature:               [Waiting]
        "2025-12-05T14:05|Real Madrid+Barcelona"
        
        Signature changed! Need to UPDATE.

T=4     Checks update buffer:                   [Waiting]
        minutesToSend = (14:05 - now) = 180 min
        > UPDATE_BUFFER_MINUTES (20)
        ✓ OK to update

T=5     Calls Braze API update...               Process A's lock expires!
        → Network request in flight             (e.g., translation API timeout)

T=6     [Waiting for Braze response]            Acquires lock (expired)

T=7     [Waiting for Braze response]            Fetches Match 123 details
                                                 kickoff: 2025-12-05 15:05 UTC (SAME!)

T=8     [Waiting for Braze response]            Checks schedule_ledger
                                                 → Finds existing schedule:
                                                    braze_schedule_id: "real-schedule-OLD"
                                                    signature: "2025-12-05T14:00|Real Madrid+Barcelona"
                                                    (HASN'T BEEN UPDATED YET!)

T=9     [Waiting for Braze response]            Calculates NEW signature:
                                                 "2025-12-05T14:05|Real Madrid+Barcelona"
                                                 
                                                 Signature changed! Need to UPDATE.

T=10    Braze API responds:                     Checks update buffer:
        ✓ schedule_id: "real-schedule-OLD"     minutesToSend = 180 min > 20
        ✓ Kept same ID (update in place)       ✓ OK to update

T=11    UPDATE schedule_ledger                  Calls Braze API update...
        SET signature = "2025-12-05T14:05..."  → Network request in flight
        WHERE match_id = 123                    (Updating SAME schedule)

T=12    ✓ Log: "updated" action                 [Waiting for Braze response]
        updated++

T=13    Continues to next match...              Braze API responds:
                                                 ✓ schedule_id: "real-schedule-OLD"

T=14    Releases lock                           UPDATE schedule_ledger
                                                 SET signature = "2025-12-05T14:05..."
                                                 WHERE match_id = 123

T=15                                             ✓ Log: "updated" action
                                                 updated++

T=16                                             Continues to next match...

T=17                                             Releases lock
```

### ✅ Outcome: SAFE (Both updated same schedule)

This scenario is MOSTLY SAFE because:
1. Both processes called UPDATE on the same Braze schedule
2. Braze API is idempotent for schedule updates
3. Final state is correct (kickoff 15:05)

**Minor Issue:** Unnecessary duplicate API call to Braze (cost, rate limits)

---

## Scenario 3: Race with Temporary Placeholder Window

### The CRITICAL Race Condition

### Timeline Visualization

```
Time    Process A (Scheduler Run #1)           Process B (Scheduler Run #2)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires lock                           [Waiting]

T=1     Fetches Match 123 details
        kickoff: 2025-12-05 15:00 UTC

T=2     Checks schedule_ledger                  [Waiting]
        → No existing schedule found

T=3     INSERT into schedule_ledger             [Waiting]
        ✓ match_id: 123
        ✓ braze_schedule_id: "pending-aaa-111"
        ✓ signature: "2025-12-05T14:00|Real Madrid+Barcelona"
        ✓ status: 'pending'

T=4     Calls Braze API create...               Lock expires! (e.g., deadlock)
        POST /campaigns/trigger/schedule/create  
        → Network request in flight

T=5     [Waiting for Braze response]            Acquires lock

T=6     [Waiting for Braze response]            Fetches Match 123 details
                                                 kickoff: 2025-12-05 15:00 UTC

T=7     [Waiting for Braze response]            Checks schedule_ledger
                                                 → FINDS existing schedule:
                                                    match_id: 123
                                                    braze_schedule_id: "pending-aaa-111"
                                                    signature: "2025-12-05T14:00|..."
                                                    status: 'pending'

T=8     [Waiting for Braze response]            Is this a REAL schedule or placeholder?
                                                 → Impossible to know!
                                                 → braze_schedule_id starts with "pending-"
                                                 → But this is just a string...

T=9     [Waiting for Braze response]            Signature comparison:
                                                 "2025-12-05T14:00|..." === "2025-12-05T14:00|..."
                                                 → TRUE

T=10    Braze API responds:                     Decides to SKIP (unchanged)
        ✓ schedule_id: "real-schedule-AAA"     skipped++
        
        UPDATE schedule_ledger
        SET braze_schedule_id = "real-AAA"
        WHERE match_id = 123

T=11    ✓ Log: "created" action                 Continues to next match...
        scheduled++

T=12    POST-RUN DEDUPLICATION starts           Process B finishes
        Fetches Braze schedules for campaign
        → Finds: ["real-schedule-AAA"]

T=13    Groups by match_id:
        Match 123: ["real-schedule-AAA"]
        Only 1 schedule, no duplicates

T=14    ✓ No duplicates found                   [Process B released lock]

T=15    Releases lock
```

### ✅ Outcome: SAFE (Process B skipped correctly)

---

## Scenario 4: Race with Braze API Returning Different IDs

### CRITICAL FAILURE SCENARIO

### Timeline Visualization

```
Time    Process A (Scheduler Run #1)           Process B (Scheduler Run #2)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires lock                           [Waiting]

T=1     Fetches Match 123 details
        kickoff: 2025-12-05 15:00 UTC

T=2     Checks schedule_ledger                  [Waiting]
        → No existing schedule found

T=3     INSERT into schedule_ledger             [Waiting]
        ✓ match_id: 123
        ✓ braze_schedule_id: "pending-aaa-111"
        ✓ signature: "2025-12-05T14:00|Real Madrid+Barcelona"
        ✓ status: 'pending'

T=4     Calls Braze API create...               Lock expires (network timeout)
        POST /campaigns/trigger/schedule/create

T=5     [Waiting for Braze response]            Acquires lock

T=6     [Waiting for Braze response]            Fetches Match 123 details
                                                 kickoff: 2025-12-05 15:00:01 UTC
                                                 (1 SECOND DIFFERENCE from API!)

T=7     [Waiting for Braze response]            Calculates signature:
                                                 "2025-12-05T14:00:01|Real Madrid+Barcelona"
                                                 (Note the :01 second difference!)

T=8     [Waiting for Braze response]            Checks schedule_ledger
                                                 → FINDS existing schedule:
                                                    match_id: 123
                                                    braze_schedule_id: "pending-aaa-111"
                                                    signature: "2025-12-05T14:00:00|..."

T=9     [Waiting for Braze response]            Signature comparison:
                                                 "2025-12-05T14:00:00|..." === "2025-12-05T14:00:01|..."
                                                 → FALSE ❌

T=10    [Waiting for Braze response]            Signature changed!
                                                 Checks update buffer:
                                                 minutesToSend = 180 min > 20
                                                 ✓ OK to update

T=11    [Waiting for Braze response]            Calls Braze API update...
                                                 POST /campaigns/trigger/schedule/update
                                                 {
                                                   schedule_id: "pending-aaa-111",
                                                   schedule: { time: "2025-12-05T14:00:01Z" },
                                                   ...
                                                 }

T=12    Braze API responds to Process A:        [Waiting for Braze response]
        ✓ schedule_id: "real-schedule-AAA"
        
        UPDATE schedule_ledger
        SET braze_schedule_id = "real-AAA"
        WHERE match_id = 123
        AND braze_schedule_id = "pending-aaa-111"

T=13    ✓ Log: "created" action                 Braze API responds:
        scheduled++                             ❌ ERROR: Schedule not found
                                                 Status: 404
                                                 (Because "pending-aaa-111" doesn't exist in Braze!)

T=14    POST-RUN DEDUPLICATION starts           Log: "error" action
                                                 "Braze API update failed"
                                                 
                                                 No ledger update (update failed)

T=15    Fetches Braze schedules:                Continues to next match...
        → Finds: ["real-schedule-AAA"]
        
        Groups by match_id:
        Match 123: ["real-schedule-AAA"]

T=16    No duplicates found                     Releases lock

T=17    Releases lock

════════════════════════════════════════════════════════════════════════════════
FINAL STATE:
  ✓ schedule_ledger: match_id=123, braze_schedule_id="real-AAA"
  ✓ Braze: 1 schedule "real-AAA" for Match 123
  ✓ Notification WILL send (only once)
  
  ⚠️ Process B logged an error but system recovered
```

### ✅ Outcome: SAFE (System recovered from error)

---

## Scenario 5: CRITICAL - Concurrent INSERT Race

### THE ACTUAL DUPLICATE NOTIFICATION BUG

### Timeline Visualization

```
Time    Process A (Scheduler Run #1)           Process B (Scheduler Run #2)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires lock (table-level)             [Running on different server instance]
        lockId = "aaa-111"                      Acquires lock (table-level) 
                                                 lockId = "bbb-222"
                                                 
        ⚠️ BOTH acquire lock because they query
           scheduler_locks at EXACTLY the same time
           and BOTH see expired/null lock

T=1     Fetches Match 123 details               Fetches Match 123 details
        kickoff: 2025-12-05 15:00 UTC          kickoff: 2025-12-05 15:00 UTC

T=2     Checks schedule_ledger                  Checks schedule_ledger
        SELECT * WHERE match_id=123             SELECT * WHERE match_id=123
        → No existing schedule                  → No existing schedule
        (BOTH queries execute simultaneously)

T=3     INSERT into schedule_ledger             INSERT into schedule_ledger
        match_id: 123                           match_id: 123
        braze_schedule_id: "pending-aaa-111"   braze_schedule_id: "pending-bbb-222"
        signature: "2025-12-05T14:00|..."      signature: "2025-12-05T14:00|..."
        
        ⚠️ RACE CONDITION:
        Both INSERTs happen before unique constraint check!

T=4     ❌ Unique constraint violation!         ✓ INSERT succeeds
        Error: duplicate key value             (Process B won the race)
        violates unique constraint
        "schedule_ledger_match_pending_unique"
        
        ROLLBACK (PostgreSQL atomic)            Calls Braze API create...

T=5     Checks schedule_ledger AGAIN            [Waiting for Braze response]
        → NOW finds existing schedule:
           match_id: 123
           braze_schedule_id: "pending-bbb-222"
           signature: "2025-12-05T14:00|..."

T=6     Signature matches!                      [Waiting for Braze response]
        Decides to SKIP
        skipped++

T=7     Continues to next match...              Braze API responds:
                                                 ✓ schedule_id: "real-schedule-BBB"

T=8     Releases lock                           UPDATE schedule_ledger
                                                 SET braze_schedule_id = "real-BBB"
                                                 WHERE match_id = 123

T=9                                              ✓ Log: "created" action
                                                 scheduled++

T=10                                             Releases lock
```

### ✅ Outcome: SAFE (PostgreSQL unique constraint prevented duplicate)

**This shows the unique constraint IS working!**

---

## Scenario 6: CRITICAL - Post-Run Deduplication Deletes Wrong Schedule

### Timeline Visualization

```
Time    Process A (Scheduler Run #1)           Process B (Scheduler Run #2)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires lock                           [Waiting in queue]

T=1     Match 123 has stale schedule:
        braze_schedule_id: "old-schedule-999"
        signature: "2025-12-05T14:00|..." (OLD)
        New kickoff: 15:30 (changed!)

T=2     Signature changed, within buffer OK     [Waiting]
        Calls Braze API UPDATE...
        → Updates old-schedule-999 to new time

T=3     [Waiting for Braze response]            Lock STOLEN! (timeout)
                                                 Acquires lock

T=4     [Waiting for Braze response]            Checks Match 123
                                                 Signature changed (same detection)

T=5     [Waiting for Braze response]            But finds existing schedule:
                                                 braze_schedule_id: "old-schedule-999"
                                                 
                                                 Within update buffer? YES
                                                 
                                                 Decides to UPDATE

T=6     [Waiting for Braze response]            Calls Braze API UPDATE...
                                                 → Updates SAME schedule again
                                                 (Unnecessary but safe)

T=7     Braze API responds to A:                [Waiting for Braze response]
        ✓ Success, but Braze assigned NEW ID!
           schedule_id: "new-schedule-AAA"
           (Braze sometimes creates new schedule on update)

T=8     UPDATE schedule_ledger                  Braze API responds to B:
        SET braze_schedule_id = "new-AAA"      ✓ Success, kept old ID
        WHERE match_id = 123                    schedule_id: "old-schedule-999"

T=9     ✓ Log: "updated" action                 UPDATE schedule_ledger
                                                 SET braze_schedule_id = "old-999"
                                                 WHERE match_id = 123
                                                 
                                                 ⚠️ OVERWRITES Process A's update!

T=10    POST-RUN DEDUPLICATION starts           ✓ Log: "updated" action

T=11    Fetches Braze schedules:                POST-RUN DEDUPLICATION starts
        → Finds BOTH:
           "new-schedule-AAA"
           "old-schedule-999"

T=12    Groups by match_id:                     Fetches Braze schedules:
        Match 123: [                            → Finds BOTH:
          "new-schedule-AAA",                      "new-schedule-AAA"
          "old-schedule-999"                       "old-schedule-999"
        ]
        
        ⚠️ 2 schedules for same match!

T=13    Fetches ledger entry:                   Groups by match_id:
        SELECT braze_schedule_id                Match 123: [
        WHERE match_id = 123                      "new-schedule-AAA",
        → Returns: "old-999"                      "old-schedule-999"
        (Process B's update won)                ]

T=14    Iterates schedules:                     Fetches ledger entry:
        1. "new-schedule-AAA"                   → Returns: "old-999"
           ≠ "old-999" (ledger)
           ❌ DELETE "new-schedule-AAA"
           
        2. "old-schedule-999"
           = "old-999" (ledger)
           ✓ KEEP

T=15    ✓ Cancelled "new-schedule-AAA"          Iterates schedules:
        deduped++                               1. "new-schedule-AAA"
                                                   ≠ "old-999"
                                                   Tries to DELETE...
                                                   ❌ Already deleted by A!
                                                   (404 error, but continues)

T=16    Releases lock                           2. "old-schedule-999"
                                                   = "old-999"
                                                   ✓ KEEP

T=17                                             Releases lock

════════════════════════════════════════════════════════════════════════════════
FINAL STATE:
  ✓ schedule_ledger: match_id=123, braze_schedule_id="old-999"
  ✓ Braze: 1 schedule "old-999" for Match 123
  ✓ Notification WILL send (only once)
  
  ⚠️ But "new-schedule-AAA" was WRONGLY deleted
  ⚠️ If timing was different, could have kept wrong one
```

### ❌ Outcome: UNSAFE (Deleted wrong schedule, but system recovered due to luck)

**This demonstrates the post-run deduplication flaw!**

---

## Scenario 7: CRITICAL - Reconcile vs Scheduler Race

### Timeline Visualization

```
Time    Scheduler (Process A)                   Reconcile (Process B)
════════════════════════════════════════════════════════════════════════════════

T=0     Acquires "braze-scheduler" lock         [Not running yet]

T=1     Processes Match 123
        INSERT into schedule_ledger
        ✓ match_id: 123
        ✓ braze_schedule_id: "pending-aaa-111"

T=2     Calls Braze API create...               Triggered (manual or cron)
        POST /campaigns/trigger/schedule/create

T=3     [Waiting for Braze response]            Tries to acquire "braze-reconcile" lock
                                                 ✓ Success (different lock name!)

T=4     [Waiting for Braze response]            Fetches Braze schedules:
                                                 GET /messages/scheduled_broadcasts
                                                 → Returns: [... schedules ...]

T=5     [Waiting for Braze response]            Braze response doesn't include
                                                 schedule for Match 123 yet!
                                                 (API eventual consistency)

T=6     [Waiting for Braze response]            Fetches schedule_ledger:
                                                 → Finds: "pending-aaa-111" for Match 123

T=7     [Waiting for Braze response]            Compares:
                                                 knownScheduleIds = ["pending-aaa-111", ...]
                                                 brazeScheduleIds = [... no Match 123 ...]

T=8     [Waiting for Braze response]            Detects orphan!
                                                 "pending-aaa-111" not in Braze
                                                 
                                                 But is it a placeholder or real schedule?
                                                 → Can't tell from the string!

T=9     [Waiting for Braze response]            Decides NOT to cancel
                                                 (because schedule_id doesn't exist in Braze yet)
                                                 
                                                 Skip to signature-based reconciliation...

T=10    Braze API responds:                     Checks signature:
        ✓ schedule_id: "real-schedule-AAA"     sig = "2025-12-05T14:00|..."
                                                 Is this in desiredSignatures?
                                                 
        UPDATE schedule_ledger                  Fetches ledger signatures:
        SET braze_schedule_id = "real-AAA"     → Yes, "pending-aaa-111" has this sig

T=11    ✓ Log: "created" action                 ✓ Signature valid, keep schedule

T=12    Releases lock                           No orphans found for this match

T=13                                             Releases lock
```

### ✅ Outcome: SAFE (Reconcile correctly kept the schedule)

**But this was LUCK!** The code at line 136 checks:

```typescript
if (sig && !desiredSignatures.has(sig) && knownScheduleIds.has(broadcast.schedule_id))
```

The key protection is `knownScheduleIds.has(broadcast.schedule_id)` - this prevents cancelling schedules that don't exist in ledger yet.

---

## Summary of Race Condition Outcomes

| Scenario | Description | Outcome | Severity |
|----------|-------------|---------|----------|
| 1 | Concurrent creation, normal flow | ✅ SAFE | Low |
| 2 | Concurrent update, kickoff change | ✅ SAFE (minor inefficiency) | Low |
| 3 | Concurrent with placeholder | ✅ SAFE | Low |
| 4 | Concurrent with API 404 | ✅ SAFE (error logged) | Low |
| 5 | Simultaneous INSERT race | ✅ SAFE (unique constraint works) | Low |
| 6 | Post-run deduplication conflict | ❌ UNSAFE (wrong schedule deleted) | **🔴 CRITICAL** |
| 7 | Reconcile vs Scheduler race | ✅ SAFE (by accident) | Medium |

---

## Key Findings

### ✅ What Works Well

1. **Unique constraint prevents duplicate inserts**
   - PostgreSQL atomic operations work correctly
   - Database-level protection is reliable

2. **Signature-based deduplication**
   - Catches schedule drift
   - Works well in reconcile function

3. **Separate locks for scheduler and reconcile**
   - Allows both to run independently
   - Reduces blocking

### ❌ What Needs Fixing

1. **Post-run deduplication is flawed** (Scenario 6)
   - Can delete the wrong schedule
   - Race between ledger updates and deduplication check
   - **RECOMMENDATION:** Remove this logic entirely

2. **Lock timeout can be exceeded** (Multiple scenarios)
   - Translation API calls: 15s × N teams
   - Braze API calls: 2s × M matches
   - Total can exceed 5 minutes
   - **RECOMMENDATION:** Increase timeout to 10 minutes

3. **No guarantee against lock stealing** (Scenarios 3, 6)
   - Multiple processes can acquire lock if they query simultaneously
   - Row-level lock update is not truly atomic
   - **RECOMMENDATION:** Use PostgreSQL advisory locks at transaction level

---

## Recommended Code Changes

### Change 1: Remove Post-Run Deduplication

```typescript
// DELETE lines 635-708 from braze-scheduler/index.ts
// This logic is flawed and unnecessary with unique constraint
```

### Change 2: Increase Lock Timeout

```typescript
const LOCK_TIMEOUT_MINUTES = 10; // Increased from 5
```

### Change 3: Use PostgreSQL Advisory Locks

```sql
-- Add advisory lock functions
CREATE OR REPLACE FUNCTION try_advisory_lock_scheduler()
RETURNS BOOLEAN AS $$
  SELECT pg_try_advisory_lock(1001::bigint);
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION advisory_unlock_scheduler()
RETURNS BOOLEAN AS $$
  SELECT pg_advisory_unlock(1001::bigint);
$$ LANGUAGE SQL;
```

```typescript
// In braze-scheduler/index.ts
const { data: lockAcquired } = await supabase.rpc('try_advisory_lock_scheduler');

if (!lockAcquired) {
  return new Response(JSON.stringify({ message: 'Already running' }), ...);
}

try {
  // ... scheduler logic ...
} finally {
  await supabase.rpc('advisory_unlock_scheduler');
}
```

This ensures TRUE mutual exclusion at the PostgreSQL session level.

---

**End of Race Condition Analysis**
