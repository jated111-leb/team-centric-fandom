The `wc_congrats_notifications_enabled` feature flag already exists in the database but is not exposed in the WC Operations Panel UI because it's missing from the `TOGGLE_FLAGS` array.

Change:
- Add `'wc_congrats_notifications_enabled'` to the `TOGGLE_FLAGS` constant in `src/pages/wc/Admin.tsx` (after `iraq_eliminated`).

No new components, hooks, or migrations are required. The existing `FeatureFlagsCard` already looks up the flag by key from `wc_feature_flags` and wires the toggle through `useUpdateWcFeatureFlag`.