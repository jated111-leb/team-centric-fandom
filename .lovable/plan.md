
What I found

- Your public endpoint is `supabase/functions/braze-webhook/index.ts`, and it currently has no external-request verification at all.
- The earlier recommendation to use a Braze-generated `BRAZE_WEBHOOK_SECRET` / `X-Braze-Signature` was likely too specific for your setup.
- Braze’s Currents/setup docs appear to focus on partner auth methods like API tokens, auth keys, certificates, and IP allowlisting, which matches your experience of not seeing a dashboard-generated “webhook secret”.

What this means

- You are probably not missing it.
- More likely, Braze does not expose the exact signing-secret mechanism that the warning text assumed for the integration type you’re using.
- So the correct fix is not “find the hidden Braze secret”, but “secure `braze-webhook` with the auth mechanism Braze actually supports for this outbound integration”.

Revised fix plan

1. Identify the exact Braze source calling `braze-webhook`
   - Currents / event export
   - Canvas webhook step
   - Campaign webhook
   - Other outbound integration

2. Use the right protection for that source
   - If Braze lets you add a custom auth header or basic auth:
     validate a shared secret/header in `braze-webhook`.
   - If Braze only lets you call a URL:
     add a long secret token in the webhook URL and validate it server-side.
   - If Braze supports neither:
     use IP allowlisting as the compensating control.

3. Still fix the other warn-level issues
   - Change `verify_jwt = true` for:
     - `braze-canvas-test`
     - `growth-copilot`
   - Add an admin-only route guard for:
     - `/admin`
     - `/admin/notification-logs`
     - `/admin/analytics`
     - `/copilot`

4. Update the security finding based on the real control used
   - Resolve the open-endpoint warning with the actual Braze-supported auth method instead of `X-Braze-Signature`.

Technical details

- Files involved:
  - `supabase/functions/braze-webhook/index.ts`
  - `supabase/config.toml`
  - `src/components/ProtectedRoute.tsx`
  - `src/App.tsx`
- Important nuance:
  `braze-webhook` cannot require normal user JWT auth because Braze is the caller, so it needs external request verification, not app-login protection.

Most likely next implementation direction

- Stop waiting on a Braze “webhook secret”.
- Replace that part of the fix with one of these:
  - shared secret header,
  - secretized callback URL,
  - or IP allowlisting,
  depending on the exact Braze screen sending the requests.

If we proceed, I would plan around the shared-secret-header or secretized-URL approach first, because those are usually the cleanest fit for a public webhook endpoint.
