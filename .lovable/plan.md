
What I found

- The admin-route warn item is already addressed in code:
  - `src/App.tsx` now uses `<ProtectedRoute requireAdmin>` for `/admin`, `/admin/notification-logs`, `/admin/analytics`, and `/copilot`.
  - `src/components/ProtectedRoute.tsx` now checks `user_roles` before rendering admin-only routes.
- The remaining warn issue is the public `braze-webhook` endpoint:
  - `supabase/functions/braze-webhook/index.ts` currently accepts unauthenticated POSTs.
  - Your Braze webhook step currently has no auth header, no query token, and no body secret.
- You chose `URL token` as the protection method.
- Important technical nuance: the scan’s recommendation to switch some functions to `verify_jwt = true` is outdated for this project setup. Current guidance is to keep public/admin functions at `verify_jwt = false` and validate JWTs in code with `getClaims()`. So I would not apply that config change.

Plan

1. Secure the Braze webhook with a URL token
   - Generate/store a new secret token for Braze webhook auth.
   - Keep `braze-webhook` as a public function (`verify_jwt = false`) because Braze is the caller.
   - Add server-side validation in `supabase/functions/braze-webhook/index.ts` that rejects requests unless a required query parameter token matches the stored secret.
   - Do the token check before any payload parsing or database work.
   - Return `401` for missing/invalid token and avoid logging the token value.

2. Keep the Braze payload contract unchanged
   - Preserve the existing JSON body shape (`events`, `dispatch_id`, `properties.match_id`, etc.).
   - Do not alter the webhook analytics/deduplication logic beyond adding request authentication.
   - This minimizes risk to the current Canvas delivery-tracking flow.

3. Align Braze configuration with the new protection
   - Update the webhook URL in Braze from:
     `.../functions/v1/braze-webhook`
     to:
     `.../functions/v1/braze-webhook?token=...`
   - No request-header changes are needed since you selected URL-token auth.
   - Existing body mapping can remain as-is.

4. Treat the admin-route warning as fixed
   - The current `ProtectedRoute` implementation already covers the warn-level client-side access issue.
   - I would validate that this matches the intended UX:
     - unauthenticated users go to `/auth`
     - authenticated non-admins are redirected to `/`
     - admins can access protected admin pages

5. Handle the stale scan guidance correctly
   - Do not change `braze-canvas-test` and `growth-copilot` to `verify_jwt = true`.
   - Their current pattern—`verify_jwt = false` plus explicit JWT/admin validation in code—is the correct approach here.
   - After implementation, I would update the security findings so:
     - `client_role_checks` can be cleared
     - `webhook_endpoints_open` is resolved based on URL-token verification rather than Braze signature validation
     - non-warn findings remain untouched, per your instruction

Technical details

- Files involved:
  - `supabase/functions/braze-webhook/index.ts`
  - potentially security findings only; no database schema change is needed
- No migration is needed:
  - this is an edge-function hardening change, not a table/RLS change
- RLS context is already appropriate:
  - `user_roles` allows users to read their own role, which supports the current `ProtectedRoute` admin check
- Security behavior after the fix:
  - public callers without the token get rejected
  - Braze keeps working once its webhook URL includes the token
  - admin UI access remains role-gated on the client and protected server-side by existing backend rules

Implementation notes I would follow

- Validate token from URL query params, not request body.
- Fail closed if the secret is missing in backend configuration.
- Keep the webhook’s CORS/OPTIONS handling intact.
- Avoid adding the token to logs, responses, or stored payloads.

Most likely next implementation sequence

1. Add the webhook token verification to `braze-webhook`
2. Keep current admin-route changes as the fix for the client-side warn item
3. Re-run / reconcile the security findings so only the warn issues are closed with the correct rationale
