

## Plan: Sticky Floating Widgets for Hype Meter & Quiz

### Current State
The Hype Meter and Quiz are interleaved directly in the chat message feed as special "widget" messages. They scroll away as new messages arrive and feel buried.

### New Approach: Floating Dismissible Cards
Remove the widgets from the chat message stream and render them as **floating overlay cards** inside the chat container, positioned with `absolute`/`sticky` positioning.

### Design

```text
┌─────────────────────────────┐
│  Chat Header (الدردشة)      │
├─────────────────────────────┤
│                             │
│  [💬 chat messages scroll]  │
│                             │
│  ┌─ Hype Pill (collapsed) ─┐│  ← sticky top-right float
│  │ 🔥 4,237 مشجع    [▼]   ││     tap to expand full card
│  └─────────────────────────┘│
│                             │
│  ┌─ Quiz Pill (collapsed) ─┐│  ← sticky bottom-right float
│  │ 🧠 سؤال جديد!    [▼]   ││     tap to expand full card
│  └─────────────────────────┘│
│                             │
├─────────────────────────────┤
│  [Input bar]                │
└─────────────────────────────┘
```

### Changes to `PreGame.tsx`

1. **Remove widget messages from chat feed** -- stop inserting `isWidget: "hype"` and `isWidget: "quiz"` into the `messages` array. Filter them out in the render loop.

2. **Add collapse/expand state** for each widget:
   - `hypeExpanded` (default: `true` initially, collapses to pill after user taps "أشعل الحماس")
   - `quizExpanded` (default: `true`, collapses to pill after answering, re-expands on next quiz)

3. **Render Hype as a floating card** overlaying the top of the chat area:
   - When collapsed: a small pill/chip (`absolute top-2 left-2 z-10`) showing 🔥 count + expand chevron
   - When expanded: the full hype card with glassmorphism backdrop (`backdrop-blur-md bg-wc-surface/90`), tap outside or X to collapse

4. **Render Quiz as a floating card** overlaying the bottom of the chat area (above input):
   - When collapsed: a pulsing pill (`absolute bottom-14 left-2 z-10`) showing 🧠 + "سؤال جديد!"
   - When expanded: full quiz card with backdrop blur, auto-collapses 2s after answering, re-expands with next question

5. **Chat scroll area** gets slight padding-top and padding-bottom to avoid content being hidden behind the floating pills.

### Interaction Details
- Collapsed pills have a subtle glow/pulse animation to draw attention
- Expanding uses a smooth scale+fade transition (`transition-all duration-300`)
- Quiz pill shows a badge dot when a new unanswered question is available
- After the hype button is tapped, it auto-collapses to pill after 1.5s
- After quiz is answered, it auto-collapses after 2s, then re-expands when `handleNextQuiz` fires

