

## Plan: Add Safe Testing Mode to Growth Copilot

The current `confirm_and_send` tool calls live Braze endpoints with no safeguard beyond "preview first." There's no dry-run mode, no test user restriction, and no sandbox flag. Here's what to add:

### Changes

#### 1. Add `dry_run` mode to `confirm_and_send` (`supabase/functions/growth-copilot/index.ts`)

- Add a `dry_run` boolean parameter to the `confirm_and_send` tool definition
- When `dry_run: true`, the function does everything **except** call Braze — it builds the full payload, validates targeting, logs the campaign to `copilot_campaigns` with `status: 'dry_run'`, and returns the exact Braze payload that **would** have been sent
- This lets you verify the audience object, filters, segment targeting, and trigger properties are correct without touching a single user

#### 2. Add `test_mode` flag that restricts to a single test user (`supabase/functions/growth-copilot/index.ts`)

- When `test_mode: true`, the function overrides whatever audience/segment targeting was specified and sends **only** to `external_user_ids: ["874810"]` (the existing test user from `braze-canvas-test`)
- This lets you actually trigger a real Braze send and verify the push arrives — but only to yourself
- The AI system prompt will instruct the copilot to suggest test mode first before any real send

#### 3. Update system prompt with testing workflow (`supabase/functions/growth-copilot/index.ts`)

Add to the safety rules:
- "When the user is testing or trying the copilot for the first time, suggest using `test_mode: true` which sends only to the test user (874810)"
- "Offer `dry_run: true` to show the exact Braze payload without sending anything"
- "Recommended workflow: dry_run first → test_mode send → full send"

#### 4. Update Copilot welcome screen (`src/components/copilot/CopilotWelcome.tsx`)

Add a **Safe Testing** section to the onboarding guide explaining:
- **Dry Run**: "Ask the copilot to do a dry run — it will show you the exact Braze payload without sending anything"
- **Test Mode**: "Ask the copilot to send in test mode — it sends only to the test account so you can verify the push arrives"
- **Full Send**: "Only after verifying with dry run and test mode, confirm a full send"
- Add a suggestion prompt: "Do a dry run campaign for Al Hilal fans"

### How to Test Safely (after implementation)

1. Ask the copilot: *"Send a test push to Al Hilal fans saying 'Match tonight!'"*
2. The copilot previews with audience size, then asks to confirm
3. Say: *"Do a dry run first"* — you'll see the full Braze payload, zero sends
4. Say: *"Now send in test mode"* — only user 874810 gets the push
5. Verify you received it, then say: *"OK send it for real"* — full audience

### Files Modified

- `supabase/functions/growth-copilot/index.ts` — `dry_run` + `test_mode` params on `confirm_and_send`, system prompt update
- `src/components/copilot/CopilotWelcome.tsx` — safe testing section in onboarding guide

