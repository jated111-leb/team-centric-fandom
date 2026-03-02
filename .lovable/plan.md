

## Plan: Congrats Campaign Analytics via Braze API

### What we're building

A new "Congrats" tab on the Analytics page that pulls **real delivery data** from the Braze `/campaigns/data_series` API endpoint. This is completely separate from match reminder analytics.

### Braze API Response Structure

Per the docs, `/campaigns/data_series` returns daily entries with nested `messages` containing per-channel stats (`ios_push`, `android_push`). Each channel has: `sent`, `direct_opens`, `total_opens`, `bounces`, `body_clicks`. Top-level has `unique_recipients` and `conversions`.

We'll aggregate `ios_push` + `android_push` stats per day.

### Components

**1. New table: `campaign_analytics`**

| Column | Type |
|--------|------|
| id | uuid PK |
| campaign_id | text |
| notification_type | text (`'congrats'`) |
| date | date |
| unique_recipients | int |
| sent | int |
| direct_opens | int |
| total_opens | int |
| bounces | int |
| body_clicks | int |
| conversions | int |
| raw_data | jsonb |
| synced_at | timestamptz |

Unique on `(campaign_id, date)`. RLS: admin-only select/insert/update.

**2. New edge function: `sync-campaign-analytics`**
- Auth: admin JWT or cron secret
- Calls `GET {BRAZE_REST_ENDPOINT}/campaigns/data_series?campaign_id={BRAZE_CONGRATS_CAMPAIGN_ID}&length={days}&ending_at={date}`
- Sums `ios_push` + `android_push` arrays per day for `sent`, `direct_opens`, `total_opens`, `bounces`, `body_clicks`
- Uses top-level `unique_recipients` and `conversions`
- Upserts into `campaign_analytics`
- Accepts optional `length` param (default 30, max 100)
- Config: `verify_jwt = false` (validates auth in code like other functions)

**3. New UI: `CongratsAnalyticsSection.tsx`**
- KPI cards: Total Sent, Unique Recipients, Open Rate (direct_opens/sent), Click Rate (body_clicks/sent)
- Daily trend chart (sent + opens over time) using Recharts
- "Sync Now" button that invokes the edge function
- "Last synced" timestamp from most recent `synced_at`

**4. Analytics page update**
- Add 5th tab "Congrats" with Trophy icon
- Fetches from `campaign_analytics` table directly (no changes to `compute_analytics_summary`)
- All 4 existing tabs remain untouched

### Files changed/created
- **Migration:** Create `campaign_analytics` table + RLS
- **New:** `supabase/functions/sync-campaign-analytics/index.ts`
- **New:** `src/components/analytics/CongratsAnalyticsSection.tsx`
- **Edit:** `src/pages/Analytics.tsx` — add Congrats tab
- **Edit:** `supabase/config.toml` — add function config (auto-managed)

