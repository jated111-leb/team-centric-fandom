

## Fix: Braze "send_id requires campaign_id" error

**Root cause:** Line 700-702 in `growth-copilot/index.ts` — the payload always includes `send_id` but never includes `campaign_id`. Braze requires both or neither.

**Fix approach:** Include `BRAZE_CAMPAIGN_ID` in the payload when `send_id` is present. The secret already exists in the project.

### Implementation

**File:** `supabase/functions/growth-copilot/index.ts`

1. Read `BRAZE_CAMPAIGN_ID` from env at the top of the function (alongside the existing `BRAZE_COPILOT_API_KEY` read).
2. In the `brazePayload` construction (~line 700), add `campaign_id` alongside `send_id`:
   ```typescript
   const brazePayload: Record<string, unknown> = {
     campaign_id: brazeCampaignId,
     send_id: sendId,
     messages,
   };
   ```
3. Also add it to the scheduled send path if it has the same issue.

**Redeploy** the `growth-copilot` edge function.

