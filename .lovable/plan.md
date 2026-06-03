## Why there are duplicates

Each duplicated row pair is exactly **3 hours apart in UTC** (Spain v Iraq 16:00 + 19:00, France v Ivory Coast 16:10 + 19:10, Belgium v Tunisia 10:00 + 13:00, etc.). That's the Baghdad timezone offset.

What happened:

1. Before the timezone fix, `parseKickoff()` in `sync-worldcup-friendlies` treated sheet times like `2026-06-04 19:00` as **UTC** and stored `kickoff_utc = 19:00Z` (which displayed as 22:00 Baghdad — wrong).
2. The fix re-interprets the same bare times as **Asia/Baghdad** and stores `kickoff_utc = 16:00Z` (displays as 19:00 Baghdad — correct).
3. The sync uses `football_data_id = SHA-1(kickoff_utc | home | away)` as the upsert key. Because `kickoff_utc` changed, the SHA-1 changed, so the upsert created a **new row** instead of updating the old one.
4. The old (wrong-UTC) rows are still in `wc_matches`, and `braze-worldcup-scheduler` already queued schedules for both — `wc_schedule_ledger` confirms two `queued` entries per fixture.

DB confirms: 13 friendlies × 2 rows = 26 `wc_matches` rows, with matching duplicate ledger entries (all `queued`, no `braze_send_id` yet, so nothing has been sent to Braze production yet — safe to clean).

## Plan

### 1. Identify stale rows
The stale row in each pair is the one whose `kickoff_utc` is **3h earlier** than its twin (that's the one created under the old UTC misinterpretation). Build the list by self-joining `wc_matches` on `(home, away, kickoff_utc + 3h)` within `competition_code='FRIENDLY'`.

### 2. Cancel stale Braze schedules first, then delete
For each stale `match_id`:
   - Look up `wc_schedule_ledger` entries with a `braze_send_id` → call the WC schedule-delete edge function to cancel in Braze (defensive; today they're all NULL so this is a no-op, but the order matters in case any get scheduled before we run).
   - Delete the ledger row(s).
   - Delete the `wc_matches` row.

Run this as a one-off migration / SQL script — not a recurring job.

### 3. Make future re-syncs self-healing
Add a cleanup step in `sync-worldcup-friendlies` that runs **before** upserts: for each `(home, away)` pair present in this run, delete any future `competition_code='FRIENDLY'` rows whose `kickoff_utc` doesn't match the newly computed `kickoff_utc` (and cascade-cancel their ledger entries the same way). This ensures any future timezone/format change in the sheet won't leave orphans.

Keep the synthetic-ID scheme — it's still correct for dedup *within* a stable interpretation. The new cleanup step covers interpretation changes.

### 4. Verify
- Re-open `/wc` Schedule → expect one row per friendly, Baghdad times matching the sheet, UTC = Baghdad − 3h.
- Query `wc_schedule_ledger` → one `queued` per friendly match.

### Out of scope
- No changes to leagues, the scheduler, or notification timing logic — those are correct.
- No changes to the sheet itself.

## Technical details

- Stale-row SQL (preview, not destructive):
  ```sql
  select stale.id, stale.home_team_canonical, stale.away_team_canonical,
         stale.kickoff_utc as stale_kickoff, fresh.kickoff_utc as fresh_kickoff
  from wc_matches stale
  join wc_matches fresh
    on fresh.competition_code = 'FRIENDLY'
   and stale.competition_code = 'FRIENDLY'
   and fresh.home_team_canonical = stale.home_team_canonical
   and fresh.away_team_canonical = stale.away_team_canonical
   and fresh.kickoff_utc = stale.kickoff_utc + interval '3 hours';
  ```
- Cleanup edge function call: existing `delete-braze-schedule` (or WC equivalent) keyed by `braze_send_id` + canvas id.
- Add the pre-upsert cleanup inside the existing `for (const r of dataRows)` loop in `sync-worldcup-friendlies/index.ts`, gated on `dataRows.length > 0` so an empty sheet read never wipes data.
