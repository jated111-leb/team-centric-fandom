## Root cause

The post-game congrats function (`braze-congrats`) is working — scores arrive, the cron runs every 15 minutes (`5,20,35,50 * * * *`), and it processes matches correctly. The bug is in the eligibility filter.

`supabase/functions/braze-congrats/index.ts` line 11:
```ts
const MAX_MATCH_AGE_HOURS = 6;
```

Line 106-114 then filters `matches` with `utc_date >= now() - 6h`. The window is measured from **kickoff**, not from full-time. Most Premier League matches kick off at 15:00 UTC, end ~16:50 UTC. By the time scores reliably land in our DB (sync runs on a schedule, Football API itself has lag), and certainly after 21:00 UTC, the row is excluded forever and stays `congrats_status = 'pending'`.

DB confirms this:
- All 11 PL matches from 2026-05-24 15:00 UTC: `status=FINISHED`, scores present, `congrats_status=pending`. Never logged in `scheduler_logs` for `braze-congrats`.
- Same-day Serie A / La Liga matches that kicked off at 18:45–19:45 UTC were processed (skipped/sent) by the 23:05 UTC run because they fell inside the 6h window.

So it's not the flag, not the Braze campaign, not the scores, not the API key — it's the 6-hour kickoff cutoff silently dropping matches.

## Fix

1. **Widen the eligibility window** in `supabase/functions/braze-congrats/index.ts`:
   - Change `MAX_MATCH_AGE_HOURS = 6` → `MAX_MATCH_AGE_HOURS = 36`.
   - Rationale: covers PL Saturday 15:00 UTC matches even if scores land hours late, while still preventing the function from re-attempting truly old matches.

2. **One-time backfill of stuck "pending" matches.** Reset `congrats_status` from `pending` back to `pending` for finished matches in the last ~48h so the next cron run picks them up. (No data change needed beyond the status itself; the function will re-evaluate and either send or mark `skipped`/`sent`.) This is a data operation via the insert tool, scoped to:
   ```sql
   UPDATE matches
   SET congrats_status = 'pending'
   WHERE status = 'FINISHED'
     AND congrats_status = 'pending'
     AND score_home IS NOT NULL
     AND score_away IS NOT NULL
     AND utc_date >= NOW() - INTERVAL '36 hours';
   ```
   This is a no-op for rows already `pending`, but I'll include it for clarity. The real backfill effect comes from the widened window — the next cron tick will sweep these up.

3. **No changes** to: feature flag (already on, confirmed in `feature_flags`), Braze campaign config, cron schedule, sync function, RLS, or UI.

## Notes / non-changes

- The WC congrats path (`braze-worldcup-congrats`) is a separate function with its own `MAX_MATCH_AGE_HOURS`; this fix does not touch it.
- Matches older than 36 hours that are still `pending` will remain stuck. That's intentional — sending a "congrats" 2+ days late is worse than silence. If you want to backfill those manually for a specific match, we can do it ad-hoc.
- After deploy I'll re-query `scheduler_logs` to confirm the next cron run drains the backlog.