# World Cup 2026 Reminder Admin Dashboard

Build the read/write admin UI on top of the existing `wc_*` Supabase tables and `*-worldcup-*` edge functions. No new DDL — the migration `20260504000001_worldcup_pregame_reminders.sql` already defines:

- `wc_matches`, `wc_schedule_ledger`, `wc_notification_sends`, `wc_scheduler_logs`
- `wc_featured_teams` (12 nations seeded), `wc_team_mappings`
- `wc_feature_flags` (scheduler_enabled, dry_run_mode, holdout_enabled, holdout_percentage, iraq_safety_net_enabled, iraq_eliminated)
- `wc_scheduler_locks` and pg_cron jobs

## Routing strategy

The existing app already owns `/`, `/admin`, `/admin/analytics`, `/admin/notification-logs` for the **Premier League** scheduler and uses `/world-cup` for an unrelated game prototype. To avoid breaking those, the World Cup admin lives under its own namespace:

- `/wc` → Match Schedule
- `/wc/admin` → Operations Panel
- `/wc/admin/analytics` → KPIs
- `/wc/admin/notification-logs` → Live log tail
- `/wc/admin/users` → Admin user management

A new "🏆 World Cup 2026" sidebar group exposes these routes. The existing Premier League screens stay untouched.

## Pages

### `/wc` — Match Schedule
- Table of `wc_matches` with kickoff in next 30 days, sorted by `kickoff_utc`.
- Columns: kickoff (UTC + Asia/Baghdad), Home v Away, stage, group, priority_flag, featured_match badge, scheduled_send count (joined from `wc_schedule_ledger` grouped by `match_id`).
- Filters: stage (multi-select), group_letter, featured_match toggle, priority_flag.
- Per-row "Force re-schedule" button (admin-only) → invokes `braze-worldcup-scheduler` with `{ match_id }`.

### `/wc/admin` — Operations Panel
- Feature-flag toggles (Switch per row reading `wc_feature_flags`): `scheduler_enabled`, `dry_run_mode`, `iraq_safety_net_enabled`, `holdout_enabled`, `iraq_eliminated`. Numeric input for `holdout_percentage`.
- Action buttons (with toast + log preview): Run scheduler, Run reconciler, Run gap detection, Sync fixtures.
- CRUD section for `wc_featured_teams` (canonical_name, iso_code, display_name_en/ar, braze_attribute_value, priority_flag, enabled).
- CRUD section for `wc_team_mappings` (featured_team picker, football_data_name, football_data_id, match_pattern).

### `/wc/admin/analytics` — KPIs (last 7 days, with date-range picker)
- Cards: Notifications scheduled, Notifications delivered, Unique users reached, Holdout cohort size estimate, Gap-detection alerts (`wc_scheduler_logs` where `function_name='gap-detection-worldcup'` and `log_level='warn'`).
- Per-team breakdown (bar chart, joins ledger → featured_teams).
- Per-stage breakdown (bar chart from `wc_matches` joined to ledger).
- Time-of-day distribution of `wc_notification_sends.delivered_at` (24-bucket bar chart).
- Recharts; React Query with 60s stale time.

### `/wc/admin/notification-logs` — Live tail
- `wc_scheduler_logs` ordered by `created_at DESC`, polled every 5s via React Query `refetchInterval`.
- Filters: log_level (info/warn/error), function_name (5 WC functions), time range.
- Click row to expand `context` JSONB in a pretty-printed `<pre>`.
- Pagination (50 per page).

### `/wc/admin/users` — Admin user management
- Reuses existing invite-only flow (`AdminManagement` + `add-admin` edge function, `admin_invites` + `user_roles`).
- Admin-only via `ProtectedRoute requireAdmin`.

## Auth

Keeps the existing invite-only model (no public signup, no `viewer` role, first-signup-as-admin trigger remains unused). All `/wc/admin/*` routes wrap in `ProtectedRoute requireAdmin`; `/wc` wraps in `ProtectedRoute` (any authenticated user). This matches the current project's security memory — the spec's "first signup = admin, others = viewer" is incompatible with the locked-down auth posture and would be a separate discussion.

## Technical details

- **Data layer**: TanStack React Query hooks in `src/hooks/wc/*.ts` (`useWcMatches`, `useWcLedger`, `useWcLogs`, `useWcFeatureFlags`, `useWcFeaturedTeams`, `useWcTeamMappings`, `useWcAnalytics`). All use the existing `supabase` client; reads are RLS-aware (tables allow public SELECT, mutations require auth).
- **Edge function invocations**: `supabase.functions.invoke('sync-worldcup-data' | 'braze-worldcup-scheduler' | 'braze-worldcup-reconcile' | 'gap-detection-worldcup' | 'pre-send-verification-worldcup', { body })`.
- **Types**: `wc_*` tables don't appear in the auto-generated `src/integrations/supabase/types.ts` yet (migration not yet reflected). Use `supabase.from('wc_matches' as any)` with locally-defined TypeScript interfaces in `src/types/worldcup.ts` until the types file refreshes.
- **Timezone**: Reuse `src/lib/timezone.ts` for UTC↔Baghdad conversions.
- **Components**: shadcn Table, Card, Switch, Button, Dialog (for force-reschedule confirm + team CRUD modals), Tabs, Select, DatePickerWithRange, Recharts.
- **Theming**: Reuse the dark 1001 brand palette already defined in `index.css` / `tailwind.config.ts`. New WC sidebar group icon: Trophy from lucide-react.
- **File layout**:
  ```text
  src/pages/wc/Schedule.tsx
  src/pages/wc/Admin.tsx
  src/pages/wc/Analytics.tsx
  src/pages/wc/NotificationLogs.tsx
  src/pages/wc/Users.tsx
  src/components/wc/MatchScheduleTable.tsx
  src/components/wc/FeatureFlagsPanel.tsx
  src/components/wc/OpsActionButtons.tsx
  src/components/wc/FeaturedTeamsCrud.tsx
  src/components/wc/TeamMappingsCrud.tsx
  src/components/wc/AnalyticsKpiCards.tsx
  src/components/wc/PerTeamBreakdownChart.tsx
  src/components/wc/PerStageBreakdownChart.tsx
  src/components/wc/HourlyDistributionChart.tsx
  src/components/wc/LogsTable.tsx
  src/components/wc/LogContextDialog.tsx
  src/hooks/wc/*.ts
  src/types/worldcup.ts
  ```
- Add 5 routes in `src/App.tsx`; add the new sidebar group to `src/components/AppSidebar.tsx`.

## Out of scope

- DDL changes (migration already applied).
- Edits to existing Premier League screens (`/`, `/admin`, `/admin/analytics`, `/admin/notification-logs`).
- Edits to the `/world-cup` game prototype.
- Edge function code changes — they exist and the user says they work.
- The pre-launch checklist items (secrets setup, Football API plan, Braze IAM, dry-run flips) are operational tasks done outside the dashboard, after merge.
