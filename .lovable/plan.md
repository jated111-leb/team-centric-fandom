

# Plan: Append-Only Google Sheets Sync

## Overview
Rewrite the `google-sheets-sync` edge function to use append-only logic with in-place updates. All matches are synced (no featured-teams filter). Existing rows are updated when match data changes; new matches are appended. Rows are never deleted.

## File to Modify

### `supabase/functions/google-sheets-sync/index.ts`

**Changes:**

1. **Remove featured-teams filter** -- delete the `featured_teams` query and the `.or()` filter. Query all matches with `.limit(5000)`.

2. **Add Match ID column** as the first column (used as the unique key for row matching).

3. **Add "Last Synced" column** as the last column with a UTC timestamp.

4. **New sync logic:**
   - `GET` existing sheet data via `values:get`
   - Build a map of `{ matchId → rowNumber }` from existing rows
   - For each DB match:
     - If Match ID exists in sheet → update that row in place via `values:update`
     - If Match ID is new → collect for batch append
   - Use `values:batchUpdate` for updates and `values:append` for new rows
   - Never call `clear` (removed)

5. **New headers:**
   ```
   Match ID | Competition | Competition (AR) | Matchday | Date | Time (Baghdad) | Home Team | Home Team (AR) | Away Team | Away Team (AR) | Status | Score | Stage | Priority | Priority Score | Reason | Last Synced
   ```

## No other files change. No database changes needed.

## Technical Details
- Uses Sheets API `values:get` to read existing data before writing
- Uses `values:batchUpdate` for efficient in-place row updates
- Uses `values:append` for new rows at the bottom
- Match ID (integer from football-data.org) is the unique key
- Old/past/postponed matches remain in the sheet indefinitely
- Date range filter removed from the query so historical matches also get updated if their status changes

