

## Switch Growth Copilot to `/messages/send` — COMPLETED ✅

### Status: All changes implemented

**1. `/messages/send` with explicit `apple_push` + `android_push` objects** ✅
**2. `/messages/schedule/create` for scheduled sends** ✅
**3. IAM support (`in_app_message` object) with slideup/modal/full types** ✅
**4. `BRAZE_CAMPAIGN_ID` removed from all Braze payloads and DB inserts** ✅
**5. `send_to_existing_only: true` correctly applied only to `recipients` array (not segment/audience targeting)** ✅
**6. System prompt updated to accurately describe behavior** ✅
**7. Dry run returns `messages` object in payload preview** ✅
**8. Audit trail stored in `copilot_campaigns.trigger_properties`** ✅

### API Permissions Required on `BRAZE_COPILOT_API_KEY`
- `messages.send` ✅ (confirmed by user)
- `messages.schedule.create` ✅ (confirmed by user)
- `messages.schedule.update` ✅ (confirmed by user)
- `messages.schedule.delete` ✅ (confirmed by user)
- `segments.list` ✅ (confirmed by user)
- `segments.details` ✅ (confirmed by user)
- `messages.schedule_broadcasts` ✅ (confirmed by user)
