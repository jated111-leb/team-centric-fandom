

# Plan: Multi-Sheet Sync (All Leagues + Per-League Tabs)

## Overview
Update `google-sheets-sync` to first sync all matches to Sheet1 (as it does now), then also sync each competition's matches to its own named tab.

## File to Modify

### `supabase/functions/google-sheets-sync/index.ts`

**Changes:**

1. **Add a competition-to-sheet-name map:**
   ```text
   PD  → LaLiga
   PL  → Premier League
   SA  → Serie A
   FL1 → Ligue 1
   DED → Eredivisie
   CL  → Champions League
   EL  → Europa League
   ECL → Conference League
   ELC → Carabao Cup
   ```

2. **After syncing Sheet1 (all matches)**, add a second phase:
   - Group all matches by `competition` code
   - For each competition group, run the same read → update/append logic against the corresponding named tab
   - If `clearSheet` is true, clear all league tabs too before writing

3. **Reuse the same `syncSheet()` helper** to avoid duplicating logic -- extract the current read/update/append logic into a function that takes a sheet name and a list of matches.

## No other files change. No database changes needed.

## Technical Details
- The user has already created the tabs manually, so no need to create them via API
- Each league tab gets the same headers and column structure as Sheet1
- Match IDs are unique across competitions so the update/append logic works identically per tab
- If a tab name doesn't exist in the spreadsheet, the API will return an error for that tab -- we'll log a warning and skip it rather than failing the whole sync

