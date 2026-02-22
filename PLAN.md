# Plan: Post-Match Congrats Notification

## Context

The system currently sends **pre-match** notifications (60 min before kickoff) to users whose favorite teams are playing. This plan adds a **post-match "congrats"** notification sent to users whose team just won.

### Current Architecture (relevant)
- **Match data**: `football-data.org` API → `sync-football-data` edge function → `matches` table (has `status`, `score_home`, `score_away`)
- **User targeting**: Braze custom attributes (`Team 1`, `Team 2`, `Team 3`) — no local user preferences DB
- **Notification pipeline**: `braze-scheduler` → Braze Canvas API → `braze-webhook` → `notification_sends`
- **Dedup**: `schedule_ledger` (UNIQUE on `match_id`) + signature-based change detection
- **Cron**: `sync-football-data` and `braze-scheduler` run every 15 minutes

---

## Requirements

### 1. Data Layer: Detect Match Results

**What's needed:**
- `sync-football-data` already fetches match status and scores from football-data.org
- The `matches` table already has `status` (SCHEDULED → TIMED → IN_PLAY → FINISHED), `score_home`, `score_away`
- **Gap**: Nothing currently reacts to a match transitioning to `FINISHED`

**Changes:**
- Add a `result_notification_status` column to `matches` (e.g., `pending`, `sent`, `skipped`) to track whether a congrats notification was processed for each match
- In `sync-football-data`, after upserting matches, detect newly-finished matches (status changed to `FINISHED`) and trigger the congrats flow

### 2. Winner Determination Logic

**Rules:**
- `score_home > score_away` → home team wins
- `score_away > score_home` → away team wins
- `score_home = score_away` → draw (no congrats notification, or a "tough draw" variant — **decision needed**)
- Only send for **featured teams** (the 10 teams in `featured_teams` table)
- If both teams are featured and one wins, only target fans of the winning team

### 3. New Edge Function: `braze-congrats-scheduler`

**Separate from existing `braze-scheduler`** to keep concerns isolated (pre-match vs post-match).

**Flow:**
1. Query `matches` where `status = 'FINISHED'` AND `result_notification_status = 'pending'` AND at least one team is in `featured_teams`
2. Determine winner
3. Build Braze audience filter targeting users with winning team in `Team 1`, `Team 2`, or `Team 3`
4. Call Braze Canvas API (`/canvas/trigger/send` — immediate send, not scheduled) with a **separate Canvas ID** for congrats
5. Insert into a `congrats_ledger` table (similar to `schedule_ledger` but for post-match)
6. Update `matches.result_notification_status = 'sent'`
7. Log to `scheduler_logs`

**Trigger options:**
- Option A: Called by `sync-football-data` after detecting FINISHED matches (event-driven)
- Option B: Separate cron job every 15 minutes checking for unprocessed FINISHED matches (poll-based, more resilient)
- **Recommendation**: Option B (poll-based) — more resilient to failures; if one run fails, next run catches it

### 4. New Braze Canvas

**Requires Braze-side setup (not code):**
- Create a new Canvas in Braze for congrats notifications
- Canvas entry properties needed:
  - `match_id`, `winning_team_en`, `winning_team_ar`, `losing_team_en`, `losing_team_ar`
  - `score_home`, `score_away`, `competition_en`, `competition_ar`
  - `home_en`, `away_en`, `home_ar`, `away_ar`
- Store the new Canvas ID as env var: `BRAZE_CONGRATS_CANVAS_ID`

### 5. Deduplication: `congrats_ledger` Table

**New table** (mirrors `schedule_ledger` pattern):
```
congrats_ledger:
  id UUID PK
  match_id BIGINT FK → matches(id), UNIQUE
  winning_team TEXT
  braze_dispatch_id TEXT
  status: 'sent' | 'skipped'
  created_at, updated_at
```

- UNIQUE on `match_id` prevents double-sending
- `result_notification_status` on `matches` is the primary guard, ledger is the secondary

### 6. Feature Flag

- Add new flag: `congrats_notifications_enabled` (default: `false`)
- Check this flag before processing any congrats notifications

### 7. Webhook Handling

- The existing `braze-webhook` handler already stores events by `match_id` and `braze_event_type`
- Congrats events will come from a different Canvas but same webhook endpoint
- **Need to differentiate**: Add `notification_type` column to `notification_sends` (`pre_match` vs `congrats`) — or use the `canvas_id` to distinguish

### 8. Analytics Updates

- Update `compute_analytics_summary` to include congrats metrics:
  - Total congrats sent, unique users reached
  - Win rate breakdown by team
  - Congrats engagement (open rate, click rate)
- Add a new tab or section to the Analytics page

### 9. Timing Considerations

- football-data.org updates scores shortly after a match ends (typically within 5-15 minutes)
- `sync-football-data` runs every 15 minutes
- Worst case: congrats notification arrives ~30 min after final whistle
- If faster delivery is needed, increase sync frequency for in-play matches or use a live scores API

### 10. Draw Handling (Decision Needed)

Options:
- **Option A**: No notification on draws (simplest)
- **Option B**: Send a "tough draw" notification to both teams' fans
- **Option C**: Only send on draws in knockout stages (where it goes to penalties)

---

## Database Migrations Needed

1. `ALTER TABLE matches ADD COLUMN result_notification_status text DEFAULT 'pending'`
2. `CREATE TABLE congrats_ledger (...)` with UNIQUE on match_id
3. `INSERT INTO feature_flags (flag_name, enabled, description) VALUES ('congrats_notifications_enabled', false, ...)`
4. (Optional) `ALTER TABLE notification_sends ADD COLUMN notification_type text DEFAULT 'pre_match'`

## New Files

1. `supabase/functions/braze-congrats-scheduler/index.ts` — main congrats logic
2. SQL migration for schema changes

## Modified Files

1. `sync-football-data/index.ts` — set `result_notification_status = 'pending'` for newly-finished matches (or handled by DEFAULT)
2. `braze-webhook/index.ts` — distinguish congrats vs pre-match events (if adding `notification_type`)
3. `Analytics.tsx` + new analytics component — congrats metrics section
4. `compute_analytics_summary` SQL — add congrats stats

## Environment Variables Needed

1. `BRAZE_CONGRATS_CANVAS_ID` — the Braze Canvas for congrats notifications

## Cron Setup

```sql
SELECT cron.schedule(
  'braze-congrats-scheduler',
  '*/15 * * * *',
  $$ SELECT ... invoke edge function ... $$
);
```
