
## Fix: Critical Analytics Bug + Webhook Dedup Scale Safety — COMPLETED

### What was fixed

1. **Analytics filter bug (CRITICAL):** `ILIKE '%send%'` → `IN ('canvas.sent', 'push_sent')` in both `compute_analytics_summary` and `get_match_performance`. The old filter matched zero rows because neither event type contains "send" (they contain "sent").

2. **Webhook dedup scale safety:** Added 48-hour `sent_at` cutoff to the deduplication query in `braze-webhook/index.ts` so it doesn't scan the entire `notification_sends` table as it grows.
