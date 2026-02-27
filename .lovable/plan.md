

## Braze Payload Hardening — Production-Grade Fixes

Based on your feedback, here are the changes to `supabase/functions/growth-copilot/index.ts`:

### 1. Add `broadcast: true` for segment-only sends (must-fix per docs)
In `confirm_and_send`, when the payload uses `segment_id` without `recipients`, add `broadcast: true` to the payload. This is required by Braze for segment sends.

### 2. Add `send_to_most_recent_device_only: true` on both push objects
In `buildMessagesObject`, set this flag on both `apple_push` and `android_push` to prevent multi-device spam.

### 3. Add deep link (`custom_uri`) support to push notifications
- Add a `deep_link` parameter to both `preview_campaign` and `confirm_and_send` tool schemas.
- In `buildMessagesObject`, if `deep_link` is provided:
  - iOS: set `custom_uri` on `apple_push`
  - Android: set `custom_uri` on `android_push`
- Update system prompt to mention deep links and recommend them.

### 4. Update system prompt with production guidelines
Add a section advising the AI to:
- Suggest adding a deep link when none is provided
- Warn about image spec requirements (Android 2:1 ≥600×300, iOS max 10MB)
- Note payload size limits (iOS 1912 bytes, Android 4000 bytes)

### 5. Scheduled sends also get `broadcast: true`
Same logic applies to the `/messages/schedule/create` path.

### Files changed
- `supabase/functions/growth-copilot/index.ts` — all changes in this single file, then redeploy.

