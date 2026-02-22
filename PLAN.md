# Plan: Post-Match Congrats Push Notification (Braze Campaign)

## Context

The system currently sends **pre-match** notifications via Braze **Canvas** (scheduled 60 min before kickoff). This plan adds a **post-match "congrats" push** via a Braze **Campaign** — 1 notification per game per user, sent 10-30 minutes after the match finishes, only to fans of the winning team.

### Current Architecture (relevant)
- **Match data**: `football-data.org` API → `sync-football-data` (every 15 min) → `matches` table (has `status`, `score_home`, `score_away`)
- **User targeting**: Braze custom attributes (`Team 1`, `Team 2`, `Team 3`) — no local user preferences DB
- **Pre-match pipeline**: `braze-scheduler` → Braze Canvas API (scheduled send) → `braze-webhook` → `notification_sends`
- **Dedup**: `schedule_ledger` (UNIQUE on `match_id`) + signature-based change detection
- **Team mapping**: `team_mappings` (regex patterns → canonical names), `featured_teams` (with `braze_attribute_value`)
- **Translations**: Auto-generated Arabic via Lovable AI/Gemini, stored in `team_translations`

---

## Requirements

### 1. Detect Finished Matches with a Winner

**Already available:**
- `matches.status` transitions to `FINISHED` when football-data.org reports final result
- `matches.score_home` and `matches.score_away` are populated with final scores
- `sync-football-data` already upserts these fields every 15 minutes

**New: Track congrats notification processing per match:**
- Add `congrats_status` column to `matches` table: `NULL` (not applicable), `'pending'` (finished, needs processing), `'sent'`, `'skipped'`
- On each sync, when a match transitions to `FINISHED` with scores, set `congrats_status = 'pending'`

### 2. Winner Determination

Simple comparison — only trigger on a clear winner:
- `score_home > score_away` → home team wins
- `score_away > score_home` → away team wins
- `score_home = score_away` → draw → **skip** (set `congrats_status = 'skipped'`)
- Only process matches where the winning team is in `featured_teams`
- If both teams are featured, only target fans of the **winning** team

### 3. New Edge Function: `braze-congrats`

**Uses Braze Campaign API** (not Canvas). Immediate send via `/campaigns/trigger/send`.

**Flow:**
1. Check feature flag `congrats_notifications_enabled`
2. Acquire advisory lock (`scheduler_locks`, key: `braze-congrats`)
3. Query matches: `status = 'FINISHED' AND congrats_status = 'pending' AND score_home IS NOT NULL`
4. For each match:
   a. Determine winner (score comparison)
   b. If draw → set `congrats_status = 'skipped'`, log, continue
   c. Resolve winning team to canonical name via `team_mappings`
   d. Check if winning team is in `featured_teams`; if not → skip
   e. Get Braze attribute value for winning team from `featured_teams.braze_attribute_value`
   f. Get Arabic translations for both teams (reuse `ensureTeamTranslation` pattern)
   g. Reserve slot in `congrats_ledger` (UNIQUE on `match_id` prevents double-sends)
   h. Call Braze Campaign API: `POST /campaigns/trigger/send`
   i. Update `congrats_ledger` with `dispatch_id` from response
   j. Set `matches.congrats_status = 'sent'`
   k. Log to `scheduler_logs`
5. Release lock

**Braze Campaign API call:**
```json
POST {BRAZE_REST_ENDPOINT}/campaigns/trigger/send
{
  "campaign_id": "{BRAZE_CONGRATS_CAMPAIGN_ID}",
  "broadcast": true,
  "audience": {
    "OR": [
      { "custom_attribute": { "custom_attribute_name": "Team 1", "comparison": "equals", "value": "{winning_team_braze_value}" } },
      { "custom_attribute": { "custom_attribute_name": "Team 2", "comparison": "equals", "value": "{winning_team_braze_value}" } },
      { "custom_attribute": { "custom_attribute_name": "Team 3", "comparison": "equals", "value": "{winning_team_braze_value}" } }
    ]
  },
  "trigger_properties": {
    "match_id": "12345",
    "winning_team_en": "Real Madrid CF",
    "winning_team_ar": "ريال مدريد",
    "losing_team_en": "FC Barcelona",
    "losing_team_ar": "برشلونة",
    "score_home": 2,
    "score_away": 1,
    "home_en": "Real Madrid CF",
    "away_en": "FC Barcelona",
    "home_ar": "ريال مدريد",
    "away_ar": "برشلونة",
    "competition_en": "LaLiga",
    "competition_ar": "الدوري الإسباني",
    "result_summary": "2-1"
  }
}
```

### 4. Braze Campaign Setup (manual, in Braze dashboard)

- Create an API-triggered Campaign in Braze (not Canvas)
- Campaign type: Push Notification
- Message content uses Liquid templating with `trigger_properties`:
  - Title: `Congrats! {{trigger_properties.${winning_team_en}}} wins!`
  - Arabic: `مبروك! {{trigger_properties.${winning_team_ar}}} فاز!`
  - Body can include score: `{{trigger_properties.${result_summary}}}`
- Store the Campaign ID as env var: `BRAZE_CONGRATS_CAMPAIGN_ID`

### 5. Deduplication: `congrats_ledger` Table

```sql
CREATE TABLE congrats_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  winning_team TEXT NOT NULL,
  losing_team TEXT NOT NULL,
  score_home INT NOT NULL,
  score_away INT NOT NULL,
  braze_dispatch_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',  -- 'sent' or 'error'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id)
);
```

Two layers of protection:
1. `matches.congrats_status` — primary guard (query filter)
2. `congrats_ledger UNIQUE(match_id)` — secondary guard (DB constraint)

### 6. Feature Flag

```sql
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES ('congrats_notifications_enabled', false, 'Enable post-match congrats push notifications for winning team fans');
```

### 7. Timing: 10-30 Minutes After Match

- `sync-football-data` runs every **15 minutes** via `pg_cron`
- football-data.org typically updates within 5-15 min of final whistle
- `braze-congrats` polls for `congrats_status = 'pending'` every 15 min
- **Expected delivery window:** 10-30 min after final whistle (aligns with requirement)
- The Braze Campaign `/campaigns/trigger/send` fires immediately — no additional scheduling delay

**Cron schedule:**
```sql
-- Run every 15 minutes, offset by 5 min from sync-football-data to ensure fresh data
SELECT cron.schedule('braze-congrats', '5,20,35,50 * * * *', ...);
```

### 8. Webhook Handling

The existing `braze-webhook` handler already works for campaign events:
- Braze sends webhook events for campaigns too (send, delivery, open)
- `match_id` is included in `trigger_properties` and stored in `notification_sends`
- **Add `notification_type` column** to `notification_sends` to distinguish:
  - `'pre_match'` — existing pre-match Canvas notifications
  - `'congrats'` — new post-match campaign notifications
- The webhook handler can infer the type from `campaign_id` vs `canvas_id` in the payload

### 9. Analytics (future, not in v1)

- Track congrats notifications separately in analytics via `notification_type` column
- Metrics: congrats sent per team, open rates, engagement
- Not required for v1 launch

---

## Database Migration

```sql
-- 1. Track congrats processing status on matches
ALTER TABLE matches ADD COLUMN congrats_status TEXT DEFAULT NULL;
CREATE INDEX idx_matches_congrats_status ON matches(congrats_status) WHERE congrats_status = 'pending';

-- 2. Congrats dedup ledger
CREATE TABLE congrats_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  winning_team TEXT NOT NULL,
  losing_team TEXT NOT NULL,
  score_home INT NOT NULL,
  score_away INT NOT NULL,
  braze_dispatch_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(match_id)
);
ALTER TABLE congrats_ledger ENABLE ROW LEVEL SECURITY;

-- 3. Feature flag
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES ('congrats_notifications_enabled', false, 'Enable post-match congrats push notifications')
ON CONFLICT (flag_name) DO NOTHING;

-- 4. Lock entry
INSERT INTO scheduler_locks (lock_name) VALUES ('braze-congrats')
ON CONFLICT (lock_name) DO NOTHING;

-- 5. Notification type on notification_sends
ALTER TABLE notification_sends ADD COLUMN notification_type TEXT DEFAULT 'pre_match';
```

## New Files

1. `supabase/functions/braze-congrats/index.ts` — post-match congrats scheduler

## Modified Files

1. `supabase/functions/sync-football-data/index.ts` — set `congrats_status = 'pending'` when match transitions to FINISHED with scores
2. `supabase/functions/braze-webhook/index.ts` — populate `notification_type` from campaign_id vs canvas_id

## Environment Variables

1. `BRAZE_CONGRATS_CAMPAIGN_ID` — the Braze Campaign ID for congrats push notifications

## Cron Setup

```sql
SELECT cron.schedule(
  'braze-congrats',
  '5,20,35,50 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('supabase.url') || '/functions/v1/braze-congrats',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);
```

## Open Decisions

1. **Draws**: Plan assumes skip. Revisit if you want a "tough match" variant later.
2. **Both teams featured, winner is featured**: Only fans of winning team get the notification. Losing team fans get nothing. Confirm this is desired.
3. **Excluded competitions**: Same exclusion list as pre-match (FL1, DED, EL, ECL)? Or different for congrats?
