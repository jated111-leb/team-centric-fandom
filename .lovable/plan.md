

## Add Dual-App Framing Line

**What**: Add a subtle but clear product-framing tagline that teaches users the dual-app behavior — watch on TOD, interact here on 1001.

**Where**: Below the action row buttons and tag pills, right before the phase-specific content begins. This is the natural "orientation" zone where users understand what the screen is about.

**How**: A single line of text, phase-aware:
- **Pre-game**: `📺 شاهد على TOD وخلّي 1001 مفتوح للتفاعل المباشر` (watch on TOD, keep 1001 open for live interaction)
- **Live**: `📺 المشاهدة على TOD، والدردشة والتحديات هنا` (watching on TOD, chat and challenges here)
- **Post-game**: `هذا هو مكانك للنقاش والتفاعل بعد المباراة` (this is your place for post-match discussion)

**Styling**: Small text (`text-xs`), muted color (`text-wc-muted`), centered, with slight top/bottom padding. Sits between the tag pills and the divider — feels like a quiet but confident product statement.

**File changed**: `src/components/worldcup/MatchHub.tsx` — add ~10 lines after the tag pills section (after line 231).

