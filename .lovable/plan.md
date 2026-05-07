# Switch World Cup Pre-Game Reminders to Braze Campaign

Move the World Cup pre-game reminder flow from Braze **Canvas** to **Campaign** API, mirroring the old club/leagues reminder pattern. Secret `BRAZE_WC_CAMPAIGN_ID` is now configured.

## Changes

### 1. `supabase/functions/braze-worldcup-scheduler/index.ts`
- Replace `BRAZE_WC_CANVAS_ID` env var with `BRAZE_WC_CAMPAIGN_ID`.
- Replace endpoint `POST /canvas/trigger/schedule/create` with `POST /campaigns/trigger/schedule/create`.
- Replace request body field `canvas_id` with `campaign_id`. Replace `canvas_entry_properties` with `trigger_properties` (Campaign API equivalent for personalization).
- Keep everything else identical: `broadcast: true`, `schedule.time`, `audience` (OR of `WC Team 1/2/3` custom attributes, optional holdout AND), retries, advisory lock, dry-run path, signature dedup.
- Update signature input from `${match.id}|${targetTeam}|${brazeCanvasId}` to `${match.id}|${targetTeam}|${brazeCampaignId}` so the new flow re-queues cleanly without colliding with prior canvas signatures.
- Update all log messages mentioning "Canvas" to "Campaign".

### 2. `supabase/functions/braze-worldcup-reconcile/index.ts` and `pre-send-verification-worldcup/index.ts`
- Audit and switch any `/canvas/trigger/schedule/*` calls (update / delete / list) to `/campaigns/trigger/schedule/*` and swap `canvas_id` → `campaign_id`. Same for env var name.

### 3. `wc_schedule_ledger` column
- The column `braze_canvas_id` keeps its name (no DDL changes — per project rules, schema is already migrated). It will simply store the campaign ID going forward. No code outside the schedulers reads it semantically.

### 4. Admin UI labels (`src/pages/wc/*`, `src/types/worldcup.ts`)
- Rename UI-visible references from "Canvas" to "Campaign" where relevant (e.g., notification logs, schedule rows). TypeScript field name `braze_canvas_id` stays the same to match DB; only display strings change.

### 5. Memory update
- Update memory note: WC pre-game reminders now use Campaign API (matching club flow pre-match), not Canvas. Keep Canvas note for club pre-match (which still uses Canvas, per existing `BRAZE_CANVAS_ID`).

## Out of scope
- No DDL / migration changes.
- No changes to club football scheduler.
- No removal of old `BRAZE_WC_CANVAS_ID` secret (just stops being read).
- No analytics/webhook code changes (Campaign sends emit `campaign.sent` instead of `canvas.sent` — flagging as a follow-up if WC analytics are needed later).

## Verification after build
1. Confirm `BRAZE_WC_CAMPAIGN_ID` is read in scheduler.
2. Invoke `braze-worldcup-scheduler` with `dry_run_mode = true` → check `wc_scheduler_logs` shows "DRY RUN — would have called Braze Campaign trigger" with `trigger_properties` payload.
3. Spot-check ledger rows have new signature hash (no collisions with old canvas rows).
