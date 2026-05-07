# WC Workflow Parity with League Workflow

Goal: make `braze-worldcup-*` pipeline behave like the proven `braze-*` league pipeline, removing every safety/content gap identified in the audit.

## 1. Webhook auth — make WC webhook public

`supabase/functions/braze-worldcup-webhook/index.ts`
- Remove the `X-Braze-Webhook-Secret` check.
- Add `[functions.braze-worldcup-webhook] verify_jwt = false` to `supabase/config.toml` (mirror existing `braze-webhook` block).
- Update memory `mem://security/webhook-authorization-policy` to note both webhooks are public.

## 2. Pre-flight dedup parity — `braze-worldcup-scheduler` Phase 1

Before inserting a `wc_schedule_ledger` row for `(match_id, target_team)`:
1. Query `wc_notification_sends` joined via `wc_schedule_ledger.match_id` for any prior `delivery_status` in (`canvas.sent`, `push_sent`, `sent`) → if found, skip + log `skipped_already_delivered`.
2. Query `wc_schedule_ledger` for any existing row in (`queued`, `sent_to_braze`, `delivered`) for the same `(match_id, target_team)` → if found and unchanged, skip; if changed, fall into update path (#3).

Add a partial unique index:
```sql
CREATE UNIQUE INDEX wc_schedule_ledger_active_unique
  ON wc_schedule_ledger (match_id, target_team_canonical)
  WHERE status IN ('queued','sent_to_braze','delivered');
```

## 3. Update path for kickoff/content changes

Add to `braze-worldcup-scheduler` Phase 1, mirroring league logic:
- Constant `UPDATE_BUFFER_MINUTES = 20`.
- If existing ledger row found AND `signature` differs AND we're outside the 20-min update buffer:
  - Call `POST {brazeEndpoint}/canvas/trigger/schedule/update` with `canvas_id`, `schedule_id` (= `braze_send_id`), new `schedule.time`, refreshed `audience` and `canvas_entry_properties`.
  - Update ledger row (`signature`, `scheduled_send_at_utc`, `updated_at`).
- Inside the buffer → skip + log `skipped_within_buffer`.

Signature must include kickoff time + Arabic strings + canvas id so any change triggers update.

## 4. Content parity — richer `canvas_entry_properties`

Update Phase 2 payload in `braze-worldcup-scheduler`:

| Field | Source |
|---|---|
| `competition_en` / `competition_ar` | hard-coded "FIFA World Cup 2026" / "كأس العالم 2026" (or `competition_translations` if WC row added) |
| `kickoff_baghdad` | `formatInTimeZone(kickoff, 'Asia/Baghdad', 'yyyy-MM-dd HH:mm')` |
| `kickoff_ar` | League-style `الساعة H:MM ص/م DD-MM-YYYY (توقيت بغداد)` with Arabic digits |
| `sig` | The same SHA-256 signature used for dedup |
| `home_en/away_en/home_ar/away_ar` | Resolve via target/opponent lookup; fall through to step #5 for non-featured opponents |

Keep existing tournament/stage/group/venue/iraq/knockout flags.

## 5. Auto-translate non-featured opponents via Lovable AI

Add `ensureTeamTranslation(teamName)` helper to `braze-worldcup-scheduler`:
- Reads `team_translations` first (shared with league).
- On miss, calls Lovable AI Gateway (`google/gemini-2.5-flash`) with the same system prompt as league scheduler.
- Inserts result into `team_translations` (ignoring 23505 dupes).
- Logs `translation_generated` to `wc_scheduler_logs`.
- If translation returns null → fail the ledger row (`status='failed'`, `error_message='Missing Arabic translation'`) so we never send half-localized content.

## 6. Webhook correlation parity — `braze-worldcup-webhook`

Replace single-key lookup with the league-style multi-key approach:
1. Lookup ledger by `braze_send_id` (preferred).
2. Fallback: lookup by `dispatch_id` (add `braze_dispatch_id` column to `wc_schedule_ledger` if missing — already exists).
3. Fallback: time-window match on `scheduled_send_at_utc` ± 10 min where `target_team_canonical` equals `event.properties.target_team_en` or `match_id` equals `event.properties.match_id`.
4. Persist `event.properties.match_id` (now in entry properties from #4) for fast correlation.

Also store `canvas_step_name`, `canvas_name`, `canvas_id` columns in `wc_notification_sends` (add columns via migration).

## 7. True self-healing reconcile + pre-send verification

`pre-send-verification-worldcup`:
- Replace stub with league-style behavior: fetch `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=...`, build a Set of active schedule IDs, compare against `wc_schedule_ledger` rows in `sent_to_braze` due in next 30 min, **recreate** missing schedules by calling Canvas trigger create + updating ledger.
- Add advisory lock (`PRE_SEND_LOCK_KEY = 41005`) and conflict check against the scheduler/reconcile locks.

`braze-worldcup-reconcile`:
- After current logic, also fetch active Braze schedules and cancel-and-recreate any ledger row whose `braze_send_id` no longer exists in Braze but match is still in the future.

## 8. Cron + memory + logging

- Verify the 5 pg_cron jobs include WC variants on the same cadence as league (scheduler 5m, reconcile hourly, pre-send 10m). Add any missing `cron.schedule` entries via the Supabase insert tool (not migration — contains URLs/keys per project policy).
- Update `mem://infrastructure/automated-cron-tasks` to list WC jobs.
- Update memory:
  - `mem://infrastructure/braze-scheduler-pre-flight-safeguard` → applies to WC too.
  - `mem://features/pre-send-verification-system` → covers WC.
  - `mem://security/webhook-authorization-policy` → both webhooks public.
  - New: `mem://features/world-cup/scheduler-parity` summarizing the parity guarantee.

## Technical Details

**Files modified**
- `supabase/functions/braze-worldcup-scheduler/index.ts` (steps 2, 3, 4, 5)
- `supabase/functions/braze-worldcup-webhook/index.ts` (steps 1, 6)
- `supabase/functions/braze-worldcup-reconcile/index.ts` (step 7)
- `supabase/functions/pre-send-verification-worldcup/index.ts` (step 7)
- `supabase/config.toml` (step 1)

**Migrations**
- Partial unique index on `wc_schedule_ledger`.
- `wc_notification_sends`: add `canvas_id`, `canvas_name`, `canvas_step_name`, `match_id` columns.
- (Optional) Insert FIFA World Cup row into `competition_translations` for the `WC` code.

**Insert (not migration)** — pg_cron entries if any WC job is missing.

**Verification after build**
1. `curl_edge_functions` POST `/braze-worldcup-scheduler` (still in dry_run) → expect ledger rows with new signature; logs show `pre_flight_passed`, full Arabic-rich canvas_entry_properties.
2. POST `/braze-worldcup-webhook` with a synthetic `canvas.sent` carrying `properties.match_id` → row inserted in `wc_notification_sends` with non-null `match_id` + ledger flipped to `delivered`.
3. POST `/pre-send-verification-worldcup` → returns `checked/verified/recreated` counts.

## Out of scope
- No UI changes.
- No change to congrats / WC campaign delivery (the post-match flow already uses Campaign API per memory).
- No change to FOOTBALL_API ingestion.
