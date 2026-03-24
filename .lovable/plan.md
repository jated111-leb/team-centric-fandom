

# Plan: Fix Google Sheets Sync Issues

## Three Problems & Solutions

### A. 1000-row limit cutting off matches after March 7

**Root cause**: Despite `.limit(5000)` in the edge function, the Supabase client defaults to 1000 rows per request.

**Fix**: Use pagination in `google-sheets-sync/index.ts` -- fetch matches in batches of 1000 using `.range(offset, offset + 999)` until no more rows are returned, then merge all results before writing to the sheet.

### B. Missing Arabic team names

**Root cause**: The `team_translations` table doesn't have entries for every team across all competitions. Many non-featured teams were never translated.

**Fix**: In `sync-football-data/index.ts`, after upserting each match, auto-insert missing team names into `team_translations` with a blank `arabic_name` as a placeholder. Then add a UI indicator on the Team Translations page showing untranslated teams so you can fill them in. Also in the sheets sync, fall back to the English name when no Arabic translation exists (instead of showing blank).

### C. Past matches stuck on "TIMED" status

**Root cause**: `sync-football-data` only queries `daysAhead` (default 30 days into the future). Past matches that were "TIMED" when last synced never get re-checked for FINISHED status.

**Fix**: In `sync-football-data/index.ts`, add a second pass that queries the DB for matches with `status = 'TIMED'` and `match_date < today`, then re-fetches those specific matches from the football API by match ID to update their status and scores.

## Files to Modify

### 1. `supabase/functions/google-sheets-sync/index.ts`
- Replace single `.limit(5000)` query with a pagination loop fetching 1000 rows at a time
- In `matchToRow`, use English name as fallback when Arabic translation is empty: `teamMap.get(name) || name`

### 2. `supabase/functions/sync-football-data/index.ts`
- After the main competition loop, add a "stale match refresh" step:
  - Query DB for matches where `status IN ('TIMED', 'SCHEDULED')` and `match_date < today`
  - For each, call `football-data.org/v4/matches/{id}` to get current status/score
  - Upsert the updated data
- After upserting each match, check if home/away team exists in `team_translations`; if not, insert a row with blank `arabic_name`

## No Database Changes Required

## Technical Details

**Pagination pattern for Supabase**:
```text
let allMatches = [];
let offset = 0;
while (true) {
  const { data } = await supabase.from('matches').select('*')
    .order('match_date').range(offset, offset + 999);
  if (!data || data.length === 0) break;
  allMatches.push(...data);
  offset += 1000;
}
```

**Stale match refresh** uses the football-data.org single-match endpoint (`/v4/matches/{id}`) which doesn't count against competition-level rate limits. We batch these with 1-second delays to respect rate limits.

