

## Plan: Save Deeplink Generator Spec to MD File

Save the detailed "Saved Games Deeplink Generator" specification from your message into a reusable markdown file at the project root.

### File to create
- `DEEPLINK_GENERATOR_SPEC.md` — contains the full specification including:
  - Deeplink template and derivation rules
  - Critical gotchas (slug handling, asset type mapping, validation)
  - Pros/cons analysis
  - Full product spec (inputs, processing, outputs, controls)
  - Upgrade suggestions (precompute service, canonical slug, playlist mode)
  - The ready-to-use Lovable prompt

### No database or backend changes needed
This is a documentation-only change.

