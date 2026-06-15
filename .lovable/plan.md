# WC Analytics — Rebuild

Bring the World Cup analytics page up to the same depth as the league analytics, with a clean separation between **Pre-game reminders** (Canvas) and **Post-game congrats** (Campaign), per-match drill-down, and flexible time grain.

## Goals

1. **Separate pre-game vs post-game** at every level (KPIs, charts, tables) — they're different objects in Braze (Canvas vs Campaign) and have different audiences/CTAs.
2. **Fix the empty Per-team / Per-stage cards** — they render blank because the bar fill resolves to a near-invisible color on the dark surface and the chart has no `Cell` colors, no value labels, and no fallback "no data" state.
3. **Per-match (per-game) analytics** — most actionable view: which match drove the most reach / opens / clicks / conversions, pre vs post side by side.
4. **Time grain selector** — Day / Week / Month, plus the existing range selector.
5. **Inspiration from league analytics** — tabbed layout, Executive KPIs strip on top, dedicated tabs per concern, CSV export.

## New page structure

```text
World Cup Analytics
─────────────────────────────────────────────────
[ Range: Last 7d ▾ ]  [ Grain: Day ▾ ]  [Sync] [Export]

[ Executive KPI strip — 6 cards ]
  Matches notified · Pre-game reach · Congrats reach
  Open rate · Click rate · Gap alerts

[ Tabs ]
  Overview  |  Pre-game  |  Post-game  |  Per-match  |  Scheduler health
```

### Tab — Overview
- Pre vs Post stacked bar (sent / unique recipients / opens / clicks) per period.
- Combined daily/weekly/monthly time-series (two lines: pre-game vs congrats).
- Funnel: Scheduled → Sent → Unique recipients → Opens → Clicks → Conversions, shown twice (pre vs post).

### Tab — Pre-game (Canvas)
- KPI strip scoped to Canvas only.
- Time-series (chosen grain) of sent / unique_recipients / opens.
- **Per-team breakdown (fixed)** — bar with explicit team colors, value labels, sorted desc, horizontal layout when >6 teams, empty-state card when zero.
- **Per-stage breakdown (fixed)** — same treatment, ordered by tournament progression (GROUP_STAGE → LAST_32 → LAST_16 → QF → SF → 3rd → FINAL, plus FRIENDLY).
- Hourly send-time heatstrip (sanity check that sends fire at T-60).

### Tab — Post-game (Campaign)
- KPI strip scoped to Congrats campaign only (entries, unique_recipients, sent, opens, clicks, conversions, bounces).
- Time-series at chosen grain.
- Per-winning-team breakdown (only featured teams that have won at least once).
- Channel split (Android vs iOS) using `variant_breakdown` we already store.
- Send-latency: minutes from final whistle (kickoff_utc + ~110m) to congrats send — distribution chart.

### Tab — Per-match
Table, one row per match in range, columns:
- Date · Match · Stage · Status (Scheduled / Sent / Skipped)
- **Pre-game**: scheduled at, sent (Y/N), unique recipients, opens, click rate
- **Post-game**: triggered? winner, unique recipients, opens, click rate, conversions
- Health flag column (missing pre-game, missing congrats, duplicate)
- Click row → expand drawer with raw ledger row + Braze dispatch IDs + payload preview.

### Tab — Scheduler health
- Ledger duplicates (count + matches)
- Stale pending (count + matches)
- Gap alerts (last N from `wc_scheduler_logs`)
- Lock contention / recent function runs.

## Time-grain handling

Grain `day | week | month` controls bucketing of all time-series:
- `day` → `stat_date` as-is
- `week` → ISO week (`date_trunc('week', stat_date)`)
- `month` → `date_trunc('month', stat_date)`

Implemented client-side in the analytics hook (data volume is small — `wc_canvas_daily_stats` is ~one row per object per day).

## Fixing the empty Per-team / Per-stage cards

Root causes:
1. Bars use a single `hsl(var(--primary))` which lands as Verdant Green on a dark navy card — visible, but the chart container has zero data when only `queued` rows exist for the current range (we filter by `created_at` only). With 32 queued + 15 delivered + 1 sent in DB, the 7-day window may legitimately have very few rows on the current date.
2. No `<text>` labels on bars, no axis tick rotation → long team names overlap and look empty.
3. No empty-state placeholder.

Fix:
- Use distinct colors per bar (10-shade green ramp already used in league analytics — reuse `src/components/analytics/UserInsightsSection.tsx` palette).
- Add value labels on bars, rotate X-axis ticks 45°, switch to horizontal bars when >6 categories.
- Add `EmptyState` card with "No scheduled sends in range" / "No matches in this stage" copy.
- Show counts split by status (queued vs sent vs delivered) as stacked segments.

## Data sources (no new tables needed)

| Concern | Source |
|---|---|
| Pre-game delivery | `wc_canvas_daily_stats` rows where `object_type='canvas'` |
| Post-game delivery | `wc_canvas_daily_stats` rows where `object_type='campaign'` |
| Per-team breakdown | `wc_schedule_ledger.target_team_canonical` |
| Per-stage breakdown | `wc_schedule_ledger` join `wc_matches.stage` |
| Per-match pre-game | `wc_schedule_ledger` + match metadata |
| Per-match post-game | `wc_congrats_ledger` + match metadata |
| Match list | `wc_matches` |
| Scheduler health | `wc_scheduler_logs` + `wc_schedule_ledger` |

All present. No migrations needed.

## Files

**New**
- `src/components/wc-analytics/WcExecutiveKPIs.tsx`
- `src/components/wc-analytics/WcOverviewSection.tsx`
- `src/components/wc-analytics/WcPreGameSection.tsx`
- `src/components/wc-analytics/WcPostGameSection.tsx`
- `src/components/wc-analytics/WcPerMatchSection.tsx`
- `src/components/wc-analytics/WcSchedulerHealthSection.tsx`
- `src/components/wc-analytics/shared.tsx` — KPI card, empty state, color ramp, grain bucketer.

**Edited**
- `src/pages/wc/Analytics.tsx` — replace single grid with tabbed layout + grain selector + export.
- `src/hooks/wc/useWorldCup.ts` — split `useWcAnalytics` into:
  - `useWcAnalyticsOverview(days, grain)` — KPIs + time series
  - `useWcAnalyticsPreGame(days, grain)`
  - `useWcAnalyticsPostGame(days, grain)`
  - `useWcAnalyticsPerMatch(days)`
  - `useWcAnalyticsSchedulerHealth(days)`
  Each query is independent so one slow query doesn't block the rest (same pattern league analytics uses with `CongratsAnalyticsSection`).

## Out of scope

- Backend aggregation RPCs — the WC dataset is small enough that client-side bucketing over `wc_canvas_daily_stats` + `wc_schedule_ledger` is fine (matches league analytics that only moved to RPC once raw `notification_sends` got large).
- New columns / tables in Braze or DB.
- Changing send logic, ledger schema, or Braze campaign config.

## Open questions before I build

1. CSV export — do you want one combined export, or one per tab (pre-game, post-game, per-match)?
2. Per-match table — should it include **all** matches in range (incl. skipped / non-featured) or only ones we acted on?
3. Default grain when range = "Last 30 days" — Day or Week?
