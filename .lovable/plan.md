

# Plan: Auto-Sync Match Schedule to Google Sheets

## Overview
Create an edge function that pushes the current match schedule to a Google Sheet automatically after each football data sync. This keeps your Google Sheet always up-to-date without manual effort.

## How It Works

```text
Football API sync (daily 11PM UTC)
  └── sync-football-data edge function
        └── triggers google-sheets-sync edge function
              └── writes all matches to your Google Sheet
```

You'll also get a manual "Sync to Google Sheets" button on the Match Schedule page.

## Setup Required (One-Time)

You'll need a **Google Service Account** to allow the app to write to your Google Sheet:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing) → Enable the **Google Sheets API**
3. Create a **Service Account** → Download the JSON key file
4. Create a Google Sheet → Share it with the service account email (as Editor)
5. Provide the service account JSON key and the Sheet ID to Lovable

## Files to Create

### 1. `supabase/functions/google-sheets-sync/index.ts`
- Authenticates with Google Sheets API using service account credentials
- Queries the `matches` table (same filters as the Index page: featured teams, next 4 weeks)
- Joins `team_translations` for Arabic names and `competition_translations` for competition names
- Clears the target sheet and writes fresh data with headers:
  - Competition, Matchday, Date, Time (Baghdad), Home Team, Away Team, Status, Score, Stage, Priority, Priority Score, Reason, Arabic Home, Arabic Away
- Called by `sync-football-data` after each sync run
- Also callable manually via admin auth

### 2. UI: Add "Sync to Sheets" button on Index page
- Small button in the page header next to the stats
- Triggers the edge function manually
- Shows success/error toast

## Files to Modify

### 3. `supabase/functions/sync-football-data/index.ts`
- After the existing `braze-scheduler` trigger, add a call to `google-sheets-sync`

### 4. `src/pages/Index.tsx`
- Add a "Sync to Google Sheets" button in the header area

## Secrets Needed
- `GOOGLE_SERVICE_ACCOUNT_JSON` — the full JSON key from Google Cloud
- `GOOGLE_SHEET_ID` — the ID from your Google Sheet URL

## No Database Changes Required

## Technical Details
- Uses Google Sheets API v4 via REST (no SDK needed in Deno)
- Service account JWT is generated in the edge function using the private key from the JSON credentials
- Sheet is fully replaced on each sync (clear + write) to avoid stale rows
- Rate: syncs once daily automatically + on-demand via button

