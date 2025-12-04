# Notification Tracking Gaps - Comprehensive Analysis

## Overview

This document analyzes the discrepancies between **scheduled notifications** (what the system intends to send) and **actual sent notifications** (what was delivered), identifying gaps in tracking and reconciliation.

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ SCHEDULING PHASE (braze-scheduler runs every 15 min)               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  schedule_ledger table    │
                    │  Status: 'pending'        │
                    │  ✓ match_id               │
                    │  ✓ braze_schedule_id      │
                    │  ✓ signature              │
                    │  ✓ send_at_utc            │
                    │  ⚠️ dispatch_id (null)    │
                    │  ⚠️ send_id (null)        │
                    └───────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BRAZE SCHEDULING (via API)                                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │    Braze Internal DB      │
                    │  (Not directly visible)   │
                    │  ✓ schedule_id            │
                    │  ✓ campaign_id            │
                    │  ✓ audience filters       │
                    │  ✓ trigger_properties     │
                    │  ✓ scheduled_time         │
                    └───────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SEND TIME (Braze triggers at scheduled time)                        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  Braze Sends              │
                    │  (To matched users)       │
                    │  ✓ dispatch_id assigned   │
                    │  ✓ send_id assigned       │
                    │  ✓ Filters users by       │
                    │    Team 1/2/3 attributes  │
                    └───────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ WEBHOOK RECEIPT (braze-webhook receives events)                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  notification_sends table │
                    │  ✓ external_user_id       │
                    │  ✓ match_id (correlated)  │
                    │  ⚠️ braze_schedule_id     │
                    │  ✓ sent_at                │
                    │  ✓ raw_payload            │
                    └───────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────┐
                    │  schedule_ledger          │
                    │  Status: 'pending' → 'sent'│
                    └───────────────────────────┘
```

---

## Tracking Gap #1: Missing dispatch_id and send_id at Creation

### The Problem

When a schedule is created, Braze may not immediately assign `dispatch_id` and `send_id`. These are often assigned later when the schedule is actually triggered.

### Current Code

```typescript
// braze-scheduler/index.ts:576
const createData = await createRes.json();

await supabase.from('schedule_ledger').update({
  braze_schedule_id: createData.schedule_id,
  dispatch_id: createData.dispatch_id || null,  // ⚠️ Often NULL
  send_id: createData.send_id || null,           // ⚠️ Often NULL
})
```

### Impact

1. **Webhook correlation fails at Strategy 1**

```typescript
// braze-webhook/index.ts:101-110
if (dispatchId || sendId) {
  const { data: ledgerEntry } = await supabase
    .from('schedule_ledger')
    .select('match_id')
    .or(`dispatch_id.eq.${dispatchId},send_id.eq.${sendId}`)
    .maybeSingle();
  // ❌ This query returns NULL because ledger has NULL values
}
```

2. **Falls back to time-based correlation (Strategy 2)**
   - Less accurate
   - Prone to mis-attribution
   - See Gap #2 below

### Data Evidence

Query to check:
```sql
SELECT 
  COUNT(*) as total_schedules,
  COUNT(dispatch_id) as with_dispatch_id,
  COUNT(send_id) as with_send_id,
  COUNT(*) - COUNT(dispatch_id) as missing_dispatch_id,
  COUNT(*) - COUNT(send_id) as missing_send_id
FROM schedule_ledger
WHERE status = 'pending';
```

Expected result: **Most schedules have NULL dispatch_id and send_id**

---

## Tracking Gap #2: Time-Based Correlation Can Mis-Attribute

### The Problem

When `dispatch_id` and `send_id` are not available, the webhook handler uses a 4-minute time window to match notifications to schedules.

### Current Code

```typescript
// braze-webhook/index.ts:118-150
const sentAtTime = new Date(sentAt);
const windowStart = new Date(sentAtTime.getTime() - 2 * 60 * 1000); // 2 min before
const windowEnd = new Date(sentAtTime.getTime() + 2 * 60 * 1000);   // 2 min after

const { data: timeMatchedEntries } = await supabase
  .from('schedule_ledger')
  .select('match_id, send_at_utc')
  .gte('send_at_utc', windowStart)
  .lte('send_at_utc', windowEnd)
  .in('status', ['pending', 'sent']);

if (timeMatchedEntries && timeMatchedEntries.length > 0) {
  // If multiple matches, pick the CLOSEST one
  let closestEntry = timeMatchedEntries[0];
  let closestDiff = Math.abs(sentAtTime.getTime() - new Date(closestEntry.send_at_utc).getTime());
  
  for (const entry of timeMatchedEntries) {
    const diff = Math.abs(sentAtTime.getTime() - new Date(entry.send_at_utc).getTime());
    if (diff < closestDiff) {
      closestEntry = entry;
      closestDiff = diff;
    }
  }
  
  matchId = closestEntry.match_id;
}
```

### Failure Scenario

**Saturday, December 7, 2024 - Premier League Matchday**

| Match ID | Teams | Kickoff UTC | Send At UTC |
|----------|-------|-------------|-------------|
| 1001 | Manchester City vs Liverpool | 15:00:00 | 14:00:00 |
| 1002 | Arsenal vs Chelsea | 15:00:00 | 14:00:00 |
| 1003 | Manchester United vs Tottenham | 15:00:00 | 14:00:00 |

All three notifications send at **14:00:00 UTC** (same exact time).

**Webhook receives event:**
- `sent_at`: 14:00:23 UTC (23 seconds after scheduled time)
- `dispatch_id`: NULL (not in webhook payload)
- `send_id`: "xyz-789" (but not in our ledger)
- `trigger_properties.match_id`: NULL (missing from payload)

**Time-based correlation:**
```
windowStart = 13:58:23 UTC
windowEnd = 14:02:23 UTC

Query returns:
  Match 1001: send_at_utc = 14:00:00, diff = 23 seconds
  Match 1002: send_at_utc = 14:00:00, diff = 23 seconds
  Match 1003: send_at_utc = 14:00:00, diff = 23 seconds
```

**Result:** Picks Match 1001 (first in array), but the notification was actually for Match 1002!

### Impact

1. `notification_sends` table has wrong `match_id`
2. Match 1002 stays in 'pending' status forever (no webhook matched)
3. Match 1001 gets marked 'sent' twice (if its real webhook arrives)
4. Reporting shows wrong teams/competitions

---

## Tracking Gap #3: No Count Reconciliation

### The Problem

The system tracks individual schedules but never verifies the TOTAL COUNT of schedules in Braze vs the ledger.

### What We Have

```typescript
// verify-braze-schedules/index.ts
// ✓ Checks if each ledger entry exists in Braze
// ✓ Checks if past schedules have webhooks
// ❌ Does NOT check if Braze has EXTRA schedules
```

### What's Missing

```typescript
// This check does NOT exist:
const ledgerCount = await supabase
  .from('schedule_ledger')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'pending')
  .gte('send_at_utc', now.toISOString());

const brazeCount = brazeSchedules.length;

if (ledgerCount !== brazeCount) {
  // ALERT: Count mismatch!
  // Could indicate:
  // - Duplicate schedules in Braze
  // - Failed schedule creation (ledger has more than Braze)
  // - Orphaned schedules (Braze has more than ledger)
}
```

### Real-World Scenario

**Day 1:**
- Ledger: 150 pending schedules
- Braze: 150 schedules
- ✅ Everything in sync

**Day 2 (after race condition):**
- Ledger: 152 pending schedules
- Braze: 155 schedules (3 duplicates created)
- ❌ No alert fires
- ❌ Users might receive 3 duplicate notifications
- ❌ Only discovered by manual inspection or user complaints

### Current Detection Methods

1. **verify-braze-schedules** - Only checks existence, not counts
2. **braze-reconcile** - Cancels orphans, but doesn't report counts BEFORE cancellation
3. **gap-detection** - Only detects MISSING schedules, not duplicates

**None of these catch the duplicate scenario until AFTER it's too late.**

---

## Tracking Gap #4: No Per-User Send Verification

### The Problem

We track that a notification was sent (via webhook), but we don't track:
1. How many USERS received it
2. Which specific users received it
3. Whether the user count matches expectations

### Current Data Model

```sql
-- notification_sends table
CREATE TABLE notification_sends (
  id uuid PRIMARY KEY,
  external_user_id text,        -- ONE user per row
  match_id bigint,
  braze_schedule_id text,
  sent_at timestamptz,
  ...
);

-- schedule_ledger table
CREATE TABLE schedule_ledger (
  id uuid PRIMARY KEY,
  match_id bigint,
  braze_schedule_id text,
  status schedule_status,       -- 'pending', 'sent', 'cancelled'
  ...
);
```

### What's Missing

When `schedule_ledger.status` is updated to 'sent', we don't track:
- **Expected send count** (how many users should receive it)
- **Actual send count** (how many webhooks received)
- **Delta** (difference between expected and actual)

### Example Scenario

**Match 1001: Real Madrid vs Barcelona**

**Expected audience:**
- Users with Team 1 = "Real Madrid CF": 10,000 users
- Users with Team 2 = "Real Madrid CF": 5,000 users
- Users with Team 3 = "Real Madrid CF": 2,000 users
- Users with Team 1 = "FC Barcelona": 8,000 users
- Users with Team 2 = "FC Barcelona": 4,000 users
- Users with Team 3 = "FC Barcelona": 1,000 users
- **Total unique users:** ~25,000 (with overlap)

**Actual sends (from webhooks):**
- Webhooks received: 18,500

**Questions we CAN'T answer:**
1. Why did only 18,500 receive it instead of 25,000?
2. Did Braze filter out 6,500 users? (e.g., push disabled, unsubscribed)
3. Did some webhooks fail to deliver?
4. Was the audience filter configured correctly?

### Current State

```typescript
// braze-webhook/index.ts:214-242
if (matchIdsWithWebhooks.size > 0) {
  await supabase
    .from('schedule_ledger')
    .update({ status: 'sent' })
    .in('match_id', matchIdsArray)
    .eq('status', 'pending');
  
  // ✓ We know the notification was sent
  // ❌ We don't know to HOW MANY users
  // ❌ We don't know if that's the RIGHT number
}
```

---

## Tracking Gap #5: No Send Confirmation from Braze API

### The Problem

After creating a schedule in Braze, we trust that it will send. But we never:
1. Query Braze to confirm the schedule is still active before send time
2. Verify the schedule wasn't cancelled/deleted externally
3. Check if Braze encountered errors processing the schedule

### Current Flow

```
T=0: Create schedule in Braze → status='pending'
T=1 to T=59: [Nothing happens, trust Braze]
T=60: Expect notification to send
T=61: Receive webhook (or don't)
```

### What's Missing

```typescript
// This function does NOT exist:
async function preflightCheckBeforeSend(scheduleId: string) {
  // Run 5 minutes before scheduled send time
  const brazeSchedule = await fetch(
    `${brazeEndpoint}/messages/scheduled_broadcasts/${scheduleId}`,
    { headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
  );
  
  if (!brazeSchedule.ok || brazeSchedule.status === 'cancelled') {
    // ALERT: Schedule was cancelled or doesn't exist!
    await supabase.from('schedule_ledger').update({
      status: 'cancelled',
      notes: 'Schedule not found in Braze pre-flight check'
    });
  }
}
```

### Real-World Scenario

**Manual intervention:**
1. Admin logs into Braze dashboard
2. Sees a scheduled notification
3. Manually cancels it (e.g., match postponed)
4. **Our system still shows status='pending'**
5. Send time passes
6. No webhook received
7. **verify-braze-schedules** eventually detects it as "stale pending"
8. But this happens AFTER the send time, too late to fix

---

## Tracking Gap #6: Multiple Schedules Per Match in Braze

### The Problem

Despite our unique constraint on `schedule_ledger.match_id`, Braze can still have multiple schedules for the same match if:
1. Race condition creates duplicate (before constraint kicks in)
2. Manual creation in Braze dashboard
3. Failed deletion leaves orphaned schedule
4. API call succeeds but ledger update fails

### Current Detection

```typescript
// braze-reconcile/index.ts:203-250
// ✓ Groups schedules by match_id
// ✓ Keeps the one in ledger
// ✓ Cancels all others

const matchScheduleMap = new Map<string, any[]>();
for (const broadcast of ourBroadcasts) {
  const matchId = broadcast.trigger_properties?.match_id;
  if (matchId) {
    if (!matchScheduleMap.has(matchId)) {
      matchScheduleMap.set(matchId, []);
    }
    matchScheduleMap.get(matchId)!.push(broadcast);
  }
}

for (const [matchId, schedules] of matchScheduleMap.entries()) {
  if (schedules.length > 1) {
    // Cancel duplicates...
  }
}
```

### What's Missing

1. **No count of duplicates detected**
   ```typescript
   // Should log:
   console.log(`Found ${schedules.length - 1} duplicate schedules for match ${matchId}`);
   
   await supabase.from('scheduler_logs').insert({
     function_name: 'braze-reconcile',
     action: 'duplicate_count',
     reason: `Match ${matchId} has ${schedules.length} schedules`,
     details: { 
       match_id: matchId, 
       duplicate_count: schedules.length - 1,
       schedule_ids: schedules.map(s => s.schedule_id)
     },
   });
   ```

2. **No trend analysis**
   - How many duplicates per day?
   - Is the problem getting worse?
   - Which matches are most affected?

3. **No alerting**
   - If >10 duplicates found in a single run, alert admin
   - If duplicates found 3 days in a row, alert engineering

---

## Tracking Gap #7: Webhook Delivery is Not Guaranteed

### The Problem

Braze webhooks are best-effort, not guaranteed. If the webhook fails:
1. No retry mechanism (Braze may retry, but we don't control it)
2. No way to query Braze for "what was actually sent"
3. Schedule stays in 'pending' state forever

### Current Detection

```typescript
// verify-braze-schedules/index.ts:99-118
if (schedule.status === 'sent') {
  results.past_with_webhook.push(scheduleInfo);
} else {
  // STALE PENDING
  const { data: sends } = await supabase
    .from('notification_sends')
    .select('id')
    .eq('match_id', schedule.match_id)
    .limit(1);
  
  if (sends && sends.length > 0) {
    // Has webhooks but status not updated (bug)
  } else {
    // CRITICAL: No webhook received
    results.past_no_webhook.push(scheduleInfo);
  }
}
```

### What's Missing

1. **No proactive webhook verification**
   - Should query Braze send logs after expected send time
   - Should reconcile Braze logs with our webhook data

2. **No manual recovery process**
   - If webhook failed, how do we mark as 'sent'?
   - How do we know the notification actually sent?

3. **No webhook health monitoring**
   - What % of webhooks are delivered?
   - How long does webhook delivery take?
   - Are there patterns in webhook failures?

### Recommended Query

```typescript
// Query Braze send stats (if API supports)
const sendStats = await fetch(
  `${brazeEndpoint}/sends/data_series?campaign_id=${campaignId}&length=1`,
  { headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
);

// Compare with our webhook count
const { count: webhookCount } = await supabase
  .from('notification_sends')
  .select('*', { count: 'exact', head: true })
  .eq('campaign_id', campaignId)
  .gte('sent_at', yesterday)
  .lte('sent_at', today);

const delta = sendStats.messages_sent - webhookCount;
if (delta > 0) {
  console.warn(`Missing ${delta} webhooks!`);
}
```

---

## Summary Table: Tracking Gaps

| Gap # | Issue | Impact | Severity | Detection | Fix Difficulty |
|-------|-------|--------|----------|-----------|----------------|
| 1 | Missing dispatch_id/send_id | Webhook correlation fails | 🟠 HIGH | None | Medium |
| 2 | Time-based correlation mis-attributes | Wrong match_id in sends | 🟠 HIGH | None | Hard |
| 3 | No count reconciliation | Undetected duplicates | 🟠 MEDIUM | None | Easy |
| 4 | No per-user send verification | Can't verify audience size | 🟡 MEDIUM | None | Hard |
| 5 | No pre-flight confirmation | Silent cancellations | 🟡 MEDIUM | verify (late) | Medium |
| 6 | Multiple schedules per match | Duplicate sends | 🟠 MEDIUM | reconcile | Easy |
| 7 | Webhook delivery not guaranteed | Stale pending | 🟠 MEDIUM | verify (late) | Hard |

---

## Recommended Fixes

### Fix 1: Capture dispatch_id/send_id at Send Time

**Create new edge function: `braze-preflight-check`**

```typescript
// Runs 10 minutes before each scheduled send
const { data: upcomingSchedules } = await supabase
  .from('schedule_ledger')
  .select('*')
  .eq('status', 'pending')
  .gte('send_at_utc', new Date(Date.now() + 5 * 60 * 1000).toISOString())
  .lte('send_at_utc', new Date(Date.now() + 15 * 60 * 1000).toISOString());

for (const schedule of upcomingSchedules) {
  // Query Braze for updated schedule details
  const brazeSchedule = await fetch(
    `${brazeEndpoint}/messages/scheduled_broadcasts?schedule_id=${schedule.braze_schedule_id}`,
    { headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
  );
  
  if (brazeSchedule.ok) {
    const data = await brazeSchedule.json();
    
    // Update ledger with Braze-assigned IDs
    await supabase.from('schedule_ledger').update({
      dispatch_id: data.dispatch_id,
      send_id: data.send_id,
    }).eq('id', schedule.id);
  }
}
```

### Fix 2: Add Confidence Scoring to Webhook Correlation

```typescript
interface WebhookCorrelation {
  match_id: number;
  confidence: 'high' | 'medium' | 'low';
  correlation_method: 'dispatch_id' | 'send_id' | 'time_exact' | 'time_window';
  time_diff_ms?: number;
}

// Log low-confidence correlations
if (correlation.confidence === 'low') {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-webhook',
    action: 'low_confidence_correlation',
    reason: `Matched via ${correlation.correlation_method}`,
    details: correlation,
  });
}
```

### Fix 3: Add Count Reconciliation Dashboard

**Create new edge function: `braze-count-audit`**

```typescript
const ledgerPending = await supabase
  .from('schedule_ledger')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'pending')
  .gte('send_at_utc', now);

const brazeSchedules = await fetchBrazeSchedules();
const brazeCount = brazeSchedules.length;

const report = {
  timestamp: now,
  ledger_pending: ledgerPending,
  braze_actual: brazeCount,
  delta: brazeCount - ledgerPending,
  status: brazeCount === ledgerPending ? 'in_sync' : 'mismatch',
};

// Store daily reports for trending
await supabase.from('count_audit_logs').insert(report);

// Alert if mismatch
if (report.delta !== 0) {
  await supabase.from('scheduler_logs').insert({
    function_name: 'braze-count-audit',
    action: 'count_mismatch_detected',
    reason: `Braze has ${report.delta > 0 ? 'more' : 'fewer'} schedules than ledger`,
    details: report,
  });
}
```

### Fix 4: Add Webhook Health Monitoring

**Create new table: `webhook_health_metrics`**

```sql
CREATE TABLE webhook_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  total_schedules_sent int NOT NULL,
  webhooks_received int NOT NULL,
  webhooks_delayed_5min int NOT NULL,
  webhooks_delayed_10min int NOT NULL,
  webhooks_never_received int NOT NULL,
  avg_webhook_delay_ms int NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

**Populate daily:**

```typescript
// Run daily after all notifications sent
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

const { data: sentSchedules } = await supabase
  .from('schedule_ledger')
  .select('*, notification_sends(*)')
  .eq('status', 'sent')
  .gte('send_at_utc', yesterday)
  .lt('send_at_utc', new Date());

const metrics = {
  date: yesterday.toISOString().split('T')[0],
  total_schedules_sent: sentSchedules.length,
  webhooks_received: sentSchedules.filter(s => s.notification_sends.length > 0).length,
  webhooks_delayed_5min: sentSchedules.filter(s => {
    const delay = new Date(s.notification_sends[0].sent_at) - new Date(s.send_at_utc);
    return delay > 5 * 60 * 1000;
  }).length,
  // ... etc
};

await supabase.from('webhook_health_metrics').insert(metrics);
```

---

## Conclusion

The notification tracking system has **7 significant gaps** that prevent accurate reconciliation between scheduled and sent notifications. While the system functions for basic use cases, these gaps create blind spots that could mask duplicate sends, missed notifications, or webhook failures.

**Priority Fixes:**
1. 🔴 Fix #1 (dispatch_id/send_id capture)
2. 🔴 Fix #2 (webhook correlation confidence)
3. 🟠 Fix #3 (count reconciliation)

**Medium Priority:**
4. 🟡 Fix #4 (webhook health monitoring)

These fixes would provide comprehensive visibility into the notification pipeline from schedule creation through final delivery.

---

**End of Tracking Gaps Analysis**
