# Plan: World Cup Post-Game Congrats Push

Mirror the league congrats pipeline for World Cup matches: after a WC match finishes, send a single push to fans of the winning team, including the final score.

## Approach

Reuse the league pattern (`congrats_status` on matches + dedicated scheduler edge function + ledger + feature flag + cron) but in the WC namespace, targeting `wc_featured_teams` via Braze custom attributes `WC Team 1..4`. Uses the existing `BRAZE_CONGRATS_CAMPAIGN_ID` setup pattern but with a new dedicated WC campaign ID.

## Database changes

1. **`wc_matches`** — add `congrats_status text` (NULL / 'pending' / 'sent' / 'skipped') + partial index on 'pending'. Also add `score_home int`, `score_away int` (currently scores aren't stored on `wc_matches` — they only exist inside `raw_api_payload`).
2. **New `wc_congrats_ledger`** table — `match_id uuid` (UNIQUE, FK to wc_matches), `winning_team_canonical`, `losing_team_canonical`, `score_home`, `score_away`, `braze_dispatch_id`, `status`, `created_at`. Admin-only RLS, GRANTs to authenticated + service_role.
3. **`wc_feature_flags`** — insert `wc_congrats_notifications_enabled` (default false).
4. **`wc_scheduler_locks`** — insert `braze-worldcup-congrats` lock row.

## Edge function: `braze-worldcup-congrats` (new)

1. Check `wc_congrats_notifications_enabled` flag.
2. Acquire `pg_try_advisory_lock` (WC namespace key).
3. Query: `status = 'FINISHED' AND congrats_status = 'pending' AND score_home IS NOT NULL AND score_away IS NOT NULL`.
4. For each match:
   - Skip draws → set `congrats_status = 'skipped'`.
   - Resolve winner via existing `home_team_canonical` / `away_team_canonical` (already mapped by sync).
   - Confirm winner is in `wc_featured_teams` and enabled; otherwise mark `'skipped'`.
   - Look up `braze_attribute_value` for winning team.
   - Insert into `wc_congrats_ledger` (UNIQUE on match_id is the dedup gate).
   - POST `/campaigns/trigger/send` to Braze with `broadcast: true`, audience = OR across `WC Team 1..4` equals winner value, plus `trigger_properties` (winning team EN/AR, losing team EN/AR, score, stage, match_id).
   - Update ledger with `braze_dispatch_id`; set `wc_matches.congrats_status = 'sent'`.
   - Log to `wc_scheduler_logs`.

## Edge function: `sync-worldcup-data` (modify)

When upserting a match, if API reports `status = 'FINISHED'` with a score:
- Persist `score_home` and `score_away` (read from `match.score.fullTime.home/away`).
- If transitioning to FINISHED for the first time and `congrats_status IS NULL`, set it to `'pending'`.

## Edge function: `braze-worldcup-webhook` (modify)

Extend webhook insert into `wc_notification_sends` to also handle congrats campaign events (currently only handles canvas/pre-match). Tag with a `notification_type` discriminator — either add the column or infer via presence of `campaign_id` vs `canvas_id` in the payload. (Recommend adding `notification_type text default 'pre_match'` on `wc_notification_sends` for analytics parity with league.)

## Cron

Add a pg_cron job `braze-worldcup-congrats` at `5,20,35,50 * * * *` calling the new edge function (offset by 5 min from `sync-worldcup-data` so fresh scores are available).

## Secrets

New env var: `BRAZE_WC_CONGRATS_CAMPAIGN_ID` — the Braze Campaign ID for WC congrats pushes. **User must create the campaign in Braze and provide the ID** before the function will send live notifications (dry-run / skip if missing).

## Config

Add `[functions.braze-worldcup-congrats] verify_jwt = false` to `supabase/config.toml`.

## Dual-fan handling

If both teams in a finished match are featured, only fans of the **winning** team get the congrats — losing-team fans get nothing. This naturally avoids the dual-fan dedup problem we solved for pre-match (a fan of both teams in the final will still get exactly one congrats: for the winner).

## Open questions before implementation

1. **Braze campaign**: Do you want to create the WC congrats campaign in Braze yourself and share the campaign ID, or reuse `BRAZE_CONGRATS_CAMPAIGN_ID` (the league one) if the message template is generic enough?
2. **Stage filter**: Send congrats for every WC stage (group + knockouts), or knockouts only?
3. **Iraq safety-net**: Pre-match logic targets Iraq fans even if Iraq isn't in the match. For congrats, should Iraq fans receive anything when Iraq isn't playing? (Recommend: no — congrats are strictly for fans of the winner.)
4. **Feature flag default**: Default `false` like league, requiring manual toggle when ready? (Recommend yes.)
