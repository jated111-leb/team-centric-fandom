# Post-Match Congrats Push Notification — IMPLEMENTED

Feature: Send a congrats push notification to fans of the winning team, 10-30 min after the match finishes, via Braze Campaign API.

**Decisions:** Draws skipped. Winners only. Same competition exclusions as pre-match.

## What Was Built

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/20260222_congrats-notification-schema.sql` | Created | Schema: `congrats_status` on matches, `congrats_ledger` table, feature flag, notification_type column |
| `supabase/functions/braze-congrats/index.ts` | Created | Edge function: polls for FINISHED matches, determines winner, sends Braze Campaign API call |
| `src/components/CongratsSettings.tsx` | Created | Admin UI: feature flag toggle with "How it works" info |
| `src/pages/Admin.tsx` | Modified | Restructured with 3 tabs: Pre-Match, Congrats, Admin |
| `supabase/functions/sync-football-data/index.ts` | Modified | Sets `congrats_status = 'pending'` when match finishes with scores |
| `supabase/functions/braze-webhook/index.ts` | Modified | Tags `notification_type` as `'congrats'` or `'pre_match'` |

## Setup Required

1. Create an API-triggered Campaign in Braze dashboard (Push Notification)
2. Set `BRAZE_CONGRATS_CAMPAIGN_ID` in Supabase Edge Function secrets
3. Run the SQL migration
4. Enable feature flag via Admin > Congrats tab
5. Set up cron: `SELECT cron.schedule('braze-congrats', '5,20,35,50 * * * *', ...)`
