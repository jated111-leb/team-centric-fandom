

## Plan: Flexible Braze Audience Targeting in Growth Copilot

Yes — Braze's `/campaigns/trigger/send` endpoint accepts a full `audience` object with arbitrary AND/OR filter combinations including custom attributes, segments, subscription status, etc. Currently the copilot hardcodes audience to `favourite_team` filters only.

### What Changes

#### 1. Replace rigid `target_teams` with flexible `audience` parameter

Update `preview_campaign` and `confirm_and_send` tool schemas:

- Remove `target_teams` as the only targeting mechanism
- Add `audience` parameter (JSON object) that maps directly to [Braze's Connected Audience object](https://www.braze.com/docs/api/objects_filters/connected_audience/)
- Keep `target_teams` as an optional shorthand (auto-expands to `favourite_team` custom attribute filters)
- Add `external_user_ids` as optional array for individual targeting
- Add `segment_id` as optional string to target an existing Braze segment directly

The AI can then construct any combination:
```json
{
  "AND": [
    { "custom_attribute": { "custom_attribute_name": "favourite_team", "value": "Al Hilal" }},
    { "custom_attribute": { "custom_attribute_name": "league_preference", "comparison": "includes_value", "value": "La Liga" }},
    { "push_subscription_status": { "comparison": "is", "value": "opted_in" }}
  ]
}
```

#### 2. Update system prompt

Teach the AI about Braze audience filter syntax:
- Custom attributes (equals, not equals, matches regex, includes value, etc.)
- Segment membership via `segment_id`
- Push/email subscription status filters
- AND/OR combinations
- Individual user targeting via `external_user_ids` in `recipients`

#### 3. Update edge function execution logic

In `confirm_and_send`:
- If `audience` object provided, pass it directly to Braze payload
- If `target_teams` provided (shorthand), auto-expand to `favourite_team` custom attribute filters as today
- If `segment_id` provided, include it in the audience object
- If `external_user_ids` provided, populate `recipients` array
- All can be combined

#### 4. Fix chat text color

Add `text-foreground` class to message cards in `Copilot.tsx`.

### Files Modified

- `supabase/functions/growth-copilot/index.ts` — tool schemas, system prompt, execution logic
- `src/pages/Copilot.tsx` — text color fix

