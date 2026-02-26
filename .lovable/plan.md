

## Analysis & Answers to Your Questions

After reviewing the `growth-copilot/index.ts` implementation:

**Q1: Which endpoint?**
The code uses `/campaigns/trigger/send` for immediate sends (line 585) and `/campaigns/trigger/schedule/create` for scheduled sends (line 526). It uses `BRAZE_CAMPAIGN_ID` (not canvas). This is separate from the sports scheduler which migrated to Canvas.

**Q2: Liquid in the Braze campaign?**
This is the critical question only you can answer. If the campaign template in the Braze dashboard doesn't use `{{api_trigger_properties.${title}}}` and `{{api_trigger_properties.${body}}}`, then the title/body passed by the copilot are silently ignored and the user gets whatever static copy is in the template.

**Q3-Q5: Need your input** before proceeding.

---

## Plan: Address Braze Payload Correctness

### 1. Add `send_id` for traceability (`growth-copilot/index.ts`)
- Generate a unique `send_id` per send (e.g. `copilot-{campaign_name}-{timestamp}`)
- Include it in the Braze payload and store it in `copilot_campaigns`
- This gives clean correlation between backend logs and Braze events

### 2. Add `send_id` column to `copilot_campaigns` table
- Migration: `ALTER TABLE copilot_campaigns ADD COLUMN send_id text;`

### 3. Surface the endpoint and Liquid dependency in the system prompt
- Update the system prompt to tell the AI: "The Braze campaign must have Liquid templates referencing `api_trigger_properties` for title/body to take effect"
- When showing dry run results, include a note about this dependency

### 4. Add `send_to_existing_only` parameter (optional)
- Default `true` (current implicit behavior), but allow override if needed for create-on-send scenarios

### Files Modified
- `supabase/functions/growth-copilot/index.ts` — add `send_id`, update system prompt
- Database migration — add `send_id` column

