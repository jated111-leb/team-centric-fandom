

## Plan: Improve Copilot Onboarding Guide & Add Segment Size Awareness

Two changes: (1) rewrite the FAQ/help section on the Copilot page to be clearer and more comprehensive, covering segments, filters, and the campaign design workflow with segment sizes; (2) add a `get_segment_details` tool and update the system prompt so the copilot automatically shows segment sizes during preview.

### Changes

#### 1. Rewrite Copilot welcome screen (`src/pages/Copilot.tsx`)

Replace the current FAQ accordion with a restructured version:

- **Segments** section — explain you can say a segment name and the copilot will look it up live from Braze, show matching segments with sizes, and let you pick one. Include example prompts.
- **Filters & Conditions** section — expand with concrete examples of AND/OR logic, attribute operators, push/email subscription filters. Show a "recipe" style example combining segment + filter.
- **Campaign Design & Audience Sizing** section — explain that during preview the copilot will fetch and display the segment size so you know how many users you're reaching before confirming. Describe the 3-step workflow (describe → preview with audience size → confirm).
- **Scheduling** section — explain immediate vs scheduled sends with natural language time support.
- Update the suggestion prompts to include a segment-lookup example like "Show me all available segments" and a filter combo example.

#### 2. Add `get_segment_details` tool (`supabase/functions/growth-copilot/index.ts`)

- New tool: calls `GET {BRAZE_REST_ENDPOINT}/segments/details?segment_id={id}` 
- Returns segment name, description, size (estimated audience count), tags, created/updated dates
- This uses the `segments.details` permission from the new API key

#### 3. Update system prompt (`supabase/functions/growth-copilot/index.ts`)

Add instructions:
- "When previewing a campaign that targets a segment, always call `get_segment_details` to fetch the estimated audience size and include it in the preview."
- "When the user asks to browse or explore segments, call `list_braze_segments` and present them in a formatted list with names and IDs."
- "When combining a segment with filters, explain to the user that the filters will narrow down the segment audience."

### Files Modified

- `src/pages/Copilot.tsx` — rewritten welcome screen with better onboarding content
- `supabase/functions/growth-copilot/index.ts` — new `get_segment_details` tool + system prompt updates

