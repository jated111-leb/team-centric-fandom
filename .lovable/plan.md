# World Cup Analytics — API-sourced rebuild

Replace the broken webhook pipeline with a daily pull from Braze's `/canvas/data_series` (pre-game) and `/campaigns/data_series` (congrats). All delivery KPIs become authoritative because they come straight from Braze.

## What stays vs changes

| Source | Used for |
|---|---|
| `wc_schedule_ledger` (ours) | Scheduled count, per-team breakdown, per-stage breakdown |
| **New** `wc_canvas_daily_stats` (Braze API) | Delivered (sent), Unique recipients, Opens, Bounces, Body clicks, Conversions |
| `wc_notification_sends` (webhook) | **No longer read.** Kept for forensic only |
| `wc_scheduler_logs` | Gap alert count |

## Build steps

**1. New table `wc_canvas_daily_stats`** (migration)
- `stat_date date`, `braze_object_id text`, `object_type text` (`canvas` | `campaign`), `name text`
- `entries int`, `unique_recipients int`, `sent int`, `total_opens int`, `direct_opens int`, `bounces int`, `body_clicks int`, `conversions int`, `revenue numeric`
- `step_breakdown jsonb`, `variant_breakdown jsonb`, `raw_payload jsonb`
- `synced_at timestamptz default now()`
- Unique on `(stat_date, braze_object_id)` for clean upserts
- RLS: admins only, plus standard GRANTs

**2. New edge function `sync-wc-canvas-analytics`**
- Auth: `CRON_SECRET` header (same pattern as `braze-congrats`)
- For each ID in `[BRAZE_WC_CANVAS_ID, BRAZE_WC_CONGRATS_CAMPAIGN_ID]`:
  - Call `/canvas/data_series` or `/campaigns/data_series` with `length=14` (rolling backfill)
  - Aggregate per day across all steps/variants/channels (ios_push + android_push + webhook)
  - Upsert one row per `(stat_date, braze_object_id)`
- Returns summary `{ canvases_synced, rows_upserted }`
- Logs to `wc_scheduler_logs`

**3. Daily pg_cron job** at 03:15 UTC invoking the function with `CRON_SECRET`

**4. Manual "Sync now" trigger** — button on `/wc/admin/analytics` that invokes the function (covers ad-hoc refreshes)

**5. Rewrite `useWcAnalytics` hook**
- Pull `wc_canvas_daily_stats` for the date window instead of `wc_notification_sends`
- Compute `delivered = sum(sent)`, `uniqueUsers = sum(unique_recipients)`, plus new `opens` and `openRate`
- Keep per-team/per-stage from `wc_schedule_ledger` (we own that)
- Drop the hourly UTC chart (API is daily-granular); replace with **"Daily delivered" line chart** (sent vs opens over time)

**6. Update `/wc/admin/analytics` page**
- KPIs row: Scheduled, **Delivered (API)**, Unique recipients, **Open rate**, Gap alerts
- New chart: Daily sent vs opens line chart
- Keep per-team and per-stage bar charts
- Add a small "Last synced: {timestamp}" line + Sync now button
- Add a banner separating pre-game (Canvas) vs congrats (Campaign) totals

## Technical notes

- The `data_series` aggregation pattern is already proven by the throwaway `braze-canvas-data-series` function used today to verify yesterday's sends — same shape, just persisted.
- Daily rolling 14-day backfill self-heals any missed cron run.
- No webhook code is deleted or disabled in this change — it just stops feeding the analytics view. Memory `[Notification Analytics Webhook]` will be marked superseded for WC only.
- The cron `pg_net.http_post` includes the project's anon key (per Lovable convention for scheduled jobs).
