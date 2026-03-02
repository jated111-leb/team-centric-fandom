

## Fix: Resilient match enrichment in braze-webhook

### Root cause
Braze always sends empty strings for team metadata in webhook payloads — this is expected. Our `braze-webhook` function is supposed to enrich from the `matches` table, but the query can silently fail on some batches, leaving rows with NULL team data.

### Changes to `supabase/functions/braze-webhook/index.ts`

1. **Add retry logic for matches query** — if the first attempt returns null/error, retry once before giving up

2. **Log when enrichment fails** — add explicit error logging when `matchesData` is null so we can detect this in logs instead of silently proceeding

3. **Add a backfill fallback** — after insertion, if any records have NULL team data but a valid match_id, do a post-insert UPDATE to fill them from the matches table (belt-and-suspenders)

### Database migration: Backfill existing N/A rows

```sql
UPDATE notification_sends ns
SET 
  home_team = m.home_team,
  away_team = m.away_team,
  competition = m.competition,
  kickoff_utc = m.utc_date
FROM matches m
WHERE ns.match_id = m.id
  AND ns.match_id IS NOT NULL
  AND (ns.home_team IS NULL OR ns.away_team IS NULL);
```

This fixes both the ~314 existing rows for match 544461 and any other historical N/A rows that have a valid match_id.

### Summary
- **2 changes**: edge function hardening + one-time data backfill
- Braze behavior is expected (empty strings) — the fix is making our enrichment more resilient

