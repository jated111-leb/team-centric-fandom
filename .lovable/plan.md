

## Plan: Add Live Braze Segment Lookup to Growth Copilot

Braze exposes `GET /segments/list` which returns segment IDs, names, and sizes. We'll add a new tool so the copilot can fetch and present available segments on demand.

### Changes

#### 1. Add `list_braze_segments` tool (`supabase/functions/growth-copilot/index.ts`)

- New tool definition with optional `page` parameter (Braze paginates at 100 per page)
- Implementation: `GET {BRAZE_REST_ENDPOINT}/segments/list` with the existing `BRAZE_API_KEY`
- Returns segment name, ID, and analytics tracking enabled status
- The AI can then use any returned `segment_id` directly in `preview_campaign` / `confirm_and_send`

#### 2. Update system prompt

- Add guidance: "When the user wants to target a segment, call `list_braze_segments` first to find the correct segment ID, then use it in `preview_campaign`"
- Include example flow: user says "target weekly active users" → copilot lists segments → finds match → uses segment_id

### Files Modified

- `supabase/functions/growth-copilot/index.ts` — new tool + system prompt update

