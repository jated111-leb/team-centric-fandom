# WC Notification Pipeline — Bug Triage & Fixes

## Verification summary

| # | Reported | Status | Evidence |
|---|---|---|---|
| 1 | Webhook inserts non-existent columns | **NOT a bug** | Live schema dump shows `wc_notification_sends` already has `match_id (uuid)`, `canvas_id`, `canvas_name`, `canvas_step_name`. A later migration than the two you cited added them. Webhook insert is valid. |
| 2 | Scheduler queries non-existent `match_id` on `wc_notification_sends` | **NOT a bug** | Same — column exists. Query returns real rows. |
| 3 | Already-delivered guard has no per-team filter | **REAL** | `scheduler/index.ts:246-263` filters only by `match_id`. For a match with two featured teams, the first delivery blocks the second team's schedule. |
| 4 | Gap detection only checks for any ledger row | **REAL** | `gap-detection-worldcup/index.ts:43-47` uses `.limit(1)` on `match_id` only. A match with two featured teams where only one was queued passes the gap check. |
| 5 | Pre-send verification uses wrong Braze endpoint | **NOT a bug (likely)** | The same `/messages/scheduled_broadcasts` endpoint is in the production league `pre-send-verification` and `braze-reconcile` and works there. Braze returns Canvas broadcasts in this endpoint when the schedule was created with `broadcast: true` (which our WC scheduler does on line 454). Will leave unchanged unless we find empirical evidence of misses. |

## Fixes

### Fix A — Per-team already-delivered guard (Bug 3)

`supabase/functions/braze-worldcup-scheduler/index.ts` PRE-FLIGHT 1 (lines 246-263).

Switch the check from `wc_notification_sends` (which doesn't carry `target_team_canonical`) to the cleaner source of truth: `wc_schedule_ledger.status = 'delivered'`. The webhook already flips ledger rows to `'delivered'`, and the ledger is keyed by `(match_id, target_team_canonical)`.

```ts
// PRE-FLIGHT 1: already-delivered? (per target team)
const { data: alreadyDelivered } = await supabase
  .from('wc_schedule_ledger')
  .select('id, updated_at')
  .eq('match_id', match.id)
  .eq('target_team_canonical', targetTeam)
  .eq('status', 'delivered')
  .limit(1)
  .maybeSingle();
```

Why this is better than adding a join through `notification_sends`:
- One round-trip, indexed lookup
- `(match_id, target_team_canonical)` is the dedup key the rest of the function already uses
- Survives even if the webhook insert succeeded but ledger update was somehow lost (PRE-FLIGHT 2 still re-evaluates the signature)

### Fix B — Gap detection per featured team (Bug 4)

`supabase/functions/gap-detection-worldcup/index.ts`.

Currently: load matches → fetch any ledger row → flag if zero rows. Replace with: load matches, compute expected target teams per match (mirroring scheduler's logic: featured home + featured away + Iraq-safety-net), fetch the **set** of `target_team_canonical` already in ledger, log a gap for each missing team.

Logic:

```ts
// load featured teams + flags once (same as scheduler)
const { data: featuredTeams } = await supabase
  .from('wc_featured_teams').select('canonical_name, iso_code, enabled');
const featuredByCanonical = new Map(
  featuredTeams?.filter(t => t.enabled).map(t => [t.canonical_name, t]) ?? []
);
const { data: flagRows } = await supabase
  .from('wc_feature_flags').select('key, enabled');
const flag = (k: string) =>
  flagRows?.find(f => f.key === k)?.enabled === true;
const iraqSafetyNet  = flag('iraq_safety_net_enabled');
const iraqEliminated = flag('iraq_eliminated');

for (const match of upcoming ?? []) {
  // expected targets — must mirror scheduler exactly
  const expected = new Set<string>();
  if (featuredByCanonical.has(match.home_team_canonical))
    expected.add(match.home_team_canonical);
  if (featuredByCanonical.has(match.away_team_canonical))
    expected.add(match.away_team_canonical);
  if (iraqSafetyNet && !iraqEliminated) {
    if (match.home_team_iso === 'IRQ') expected.add('Iraq');
    if (match.away_team_iso === 'IRQ') expected.add('Iraq');
  }
  if (iraqEliminated) expected.delete('Iraq');
  if (expected.size === 0) continue;

  const { data: ledgerRows } = await supabase
    .from('wc_schedule_ledger')
    .select('target_team_canonical')
    .eq('match_id', match.id)
    .in('status', ['queued', 'sent_to_braze', 'delivered']);
  const present = new Set(ledgerRows?.map(r => r.target_team_canonical) ?? []);

  for (const team of expected) {
    if (!present.has(team)) {
      gaps.push({ match, missing_team: team });
      await supabase.from('wc_scheduler_logs').insert({ /* warn log with missing_team */ });
    }
  }
}
```

Note the `wc_matches` SELECT also needs `home_team_iso, away_team_iso` so the Iraq safety-net branch works.

Self-heal trigger (`invoke('braze-worldcup-scheduler')`) stays as-is — one trigger covers all per-team gaps for this run.

## Out of scope

- No DB migration is required. Both `wc_notification_sends` columns and the `/messages/scheduled_broadcasts` endpoint are already correct.
- No change to the webhook, reconcile, or league counterparts.
- The dual-fan dedup logic shipped in the previous turn is untouched.

## Deployment

After approval and edits:
1. Deploy `braze-worldcup-scheduler` and `gap-detection-worldcup`.
2. Spot-check `wc_scheduler_logs` after the next scheduler run that a `skipped_already_delivered` log line includes `target_team` (proving Fix A scopes correctly) and that gap-detection logs include `missing_team` per gap.
