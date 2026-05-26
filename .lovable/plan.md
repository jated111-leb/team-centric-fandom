# Add WC Team 4 to World Cup Reminder Targeting

## Context
The WC reminder flow targets users whose Braze custom attribute matches the canonical team value. Targeting uses an OR across the four WC team slot attributes. Currently only slots 1–3 are checked, so users whose chosen team sits in the newly added "WC Team 4" slot will not receive any pre-match reminders.

## Scope
The constant `WC_TEAM_ATTRIBUTES` is defined in exactly two edge functions and used only to build the Braze audience `OR` block. Nothing else (DB schema, ledger, webhook, analytics, UI) needs to change — it's a pure audience-expansion fix.

## Changes

1. **`supabase/functions/braze-worldcup-scheduler/index.ts`** (line 34)
   - Update constant to `['WC Team 1', 'WC Team 2', 'WC Team 3', 'WC Team 4']`
   - `buildAudience()` already maps over the array, so it picks up the 4th slot automatically.

2. **`supabase/functions/pre-send-verification-worldcup/index.ts`** (line 19)
   - Same update — keeps the recreate-missing-schedule path consistent with the primary scheduler.

3. **Deploy** both edge functions.

## Out of scope (confirmed nothing to touch)
- `wc_featured_teams` / `wc_team_mappings` — these map football-data teams to canonical names, independent of how many Braze slots a user has.
- `wc_schedule_ledger` signature / dedup — keyed by `(match_id, target_team_canonical)`, still one schedule per featured team per match. Adding a 4th slot does **not** create extra schedules; it only widens the audience inside the existing schedule.
- Webhook, analytics, congrats — none reference the slot attributes.

## Verification
- After deploy, next scheduler run (cron or `sync-worldcup-data` chain trigger) will build audiences with 4-way OR.
- Spot-check `wc_scheduler_logs` for one upcoming match's `audience` payload and confirm 4 OR clauses.
