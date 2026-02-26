

## Switch Growth Copilot to `/messages/send` for Direct Push Content Control

### Why
Currently the copilot passes `title` and `body` as `trigger_properties` to `/campaigns/trigger/send`. These are **ephemeral variables** — Braze silently ignores them unless the dashboard template has Liquid tags like `{{api_trigger_properties.${title}}}`. There's no way to validate this from code. Switching to `/messages/send` builds explicit `apple_push` and `android_push` objects, guaranteeing the content reaches the user exactly as the AI composed it.

### Changes (single file: `supabase/functions/growth-copilot/index.ts`)

**1. Update system prompt (lines 30-38)**
- Remove the Liquid dependency warning
- Replace with: "This copilot sends push via /messages/send with explicit apple_push and android_push objects. Title and body are sent directly — no campaign template dependency."

**2. Replace payload construction in `confirm_and_send` (lines 465-497)**
- Instead of `trigger_properties: { title, body, ... }` + `campaign_id`, build:
```typescript
const brazePayload = {
  send_id: sendId,
  messages: {
    apple_push: {
      alert: { title, body },
      extra: { campaign_name: name, sent_by: "copilot" },
    },
    android_push: {
      title,
      alert: body,
      extra: { campaign_name: name, sent_by: "copilot" },
    },
  },
};
```
- Audience/recipients/segment targeting stays identical

**3. Switch endpoint URLs**
- Immediate (line 605): `/campaigns/trigger/send` → `/messages/send`
- Scheduled (line 543): `/campaigns/trigger/schedule/create` → `/messages/schedule/create`

**4. Update dry run response (line 531)**
- Remove the Liquid warning message
- Show the new `messages` object in the payload preview

**5. Keep `trigger_properties` in DB logging**
- Still store `{ title, body, campaign_name, sent_by }` in `copilot_campaigns.trigger_properties` for audit trail — just no longer sent to Braze as trigger_properties

**6. Remove `BRAZE_CAMPAIGN_ID` from payload**
- `/messages/send` doesn't use `campaign_id` — content is fully inline
- Keep the env var reference for now (used in DB logging) but don't include it in the Braze request body

