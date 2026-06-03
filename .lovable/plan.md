Make the WC Match Schedule page default to showing only fixtures involving one of the featured teams. Toggle stays available so admins can still flip to the full 102-match slate when needed.

### Changes
- `src/pages/wc/Schedule.tsx`: flip the "Featured only" toggle initial state from `false` to `true`. Update the subtitle copy from "All upcoming WC fixtures" to "Upcoming fixtures for featured teams" so the page header matches the default view.

### Out of scope
- No backend / scheduler / notification changes — targeting logic already filters to featured teams.
- No change to the toggle behavior itself; admins can still disable it to view all fixtures.
- Friendlies (once added via the Google Sheet) already flow in with `featured_match=true`, so they appear under the default view.
