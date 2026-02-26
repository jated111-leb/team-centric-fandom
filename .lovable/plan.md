

## Plan: Grouped Navigation + Growth Copilot (Separate from Sports)

### Navigation Restructure

Reorganize the sidebar from a flat list into two grouped sections:

```text
┌─────────────────────┐
│ ⚽ Sports Scheduling │  (SidebarGroup)
│   Schedule           │  /
│   Admin              │  /admin
│   Analytics          │  /admin/analytics
│   Logs               │  /admin/notification-logs
├─────────────────────┤
│ 📣 Campaigns         │  (SidebarGroup)
│   Copilot            │  /copilot
├─────────────────────┤
│ Actions              │
│   Refresh Data       │
├─────────────────────┤
│ Logout               │
│ 1001                 │
└─────────────────────┘
```

### Implementation Steps

#### 1. Database migration
- Create `copilot_campaigns` table: id (uuid), name (text), status (text: draft/previewed/sent/error), segment_filter (jsonb), trigger_properties (jsonb), braze_campaign_id (text), braze_dispatch_id (text), scheduled_at (timestamptz), sent_at (timestamptz), created_by (uuid), created_at (timestamptz default now)
- Create `copilot_messages` table: id (uuid), session_id (uuid), role (text), content (text), tool_calls (jsonb), created_at (timestamptz default now), user_id (uuid)
- Add RLS: admin-only SELECT/INSERT/UPDATE on both tables using `has_role(auth.uid(), 'admin')`
- Insert `growth-copilot` row into `scheduler_locks`

#### 2. Create `growth-copilot` edge function
- Streaming SSE endpoint using Lovable AI gateway (`google/gemini-2.5-flash`)
- System prompt: "You are a Growth Operations Copilot for 1001 Sports. You help create and send Braze push campaigns."
- Tool definitions:
  - `list_featured_teams` — queries featured_teams table
  - `lookup_upcoming_matches` — queries matches table
  - `preview_campaign` — validates inputs, returns formatted preview card (no Braze call)
  - `confirm_and_send` — calls Braze `/campaigns/trigger/send`, logs to `copilot_campaigns` and `scheduler_logs`
  - `get_campaign_history` — queries copilot_campaigns
- Safety: AI must call `preview_campaign` before `confirm_and_send`; rate limit 5 sends/hour
- Uses existing secrets: `BRAZE_API_KEY`, `BRAZE_REST_ENDPOINT`, `BRAZE_CAMPAIGN_ID`
- Auth: verify_jwt = false, validate admin JWT in code (same pattern as braze-congrats)

#### 3. Create `/copilot` page (`src/pages/Copilot.tsx`)
- Chat interface with message input and streaming responses
- Messages rendered with markdown
- Tool results displayed as structured cards (campaign preview, team lists)
- Inline "Confirm Send" button when AI asks for approval
- Session persistence via `copilot_messages` table
- Admin-only access check (same pattern as Admin page)

#### 4. Update sidebar (`AppSidebar.tsx`)
- Split nav items into two `SidebarGroup`s: "Sports Scheduling" and "Campaigns"
- Add Copilot link with `Sparkles` icon under Campaigns group
- Keep Actions and Footer groups as-is

#### 5. Add route (`App.tsx`)
- Add `/copilot` route with ProtectedRoute + Layout wrapper

#### 6. Update `supabase/config.toml`
- Add `[functions.growth-copilot]` with `verify_jwt = false`

