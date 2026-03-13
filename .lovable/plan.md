

# Plan: Create La Liga Fan Hub Page

## Overview
Clone the World Cup fan hub as a separate `/la-liga` page connected to real match data from the database. Replace all TOD branding with **فدشي** (Fedshi). Add a dummy video player area. When multiple La Liga matches overlap, auto-select Real Madrid or Barcelona matches as priority.

## Key Differences from World Cup

1. **Brand: فدشي (not TOD, not 1001)** -- copy the uploaded logo files into `src/assets/` and use them in place of `tod-logo.png`
2. **Dummy video player** -- a placeholder video player area (dark rectangle with play icon) embedded in the live phase, representing in-app viewing (La Liga is playable within the app)
3. **Real match data** from `matches` table (`competition = 'PD'`) with Arabic team names from `team_translations`
4. **Smart match selection** -- when multiple matches share the same date/time, prioritize Real Madrid CF or FC Barcelona; user can also manually switch between matches

## Files to Create

### 1. `src/assets/fedshi-logo.png` (copy from uploaded Fadshiii.png -- green on dark)
### 2. `src/lib/laligaMockData.ts`
- La Liga-themed quiz questions (about La Liga history, El Clasico, Messi/Ronaldo records)
- La Liga-themed chat usernames ("مدريدي عتيق", "كوليه حتى النخاع", "عاشق الليغا")
- La Liga-themed chat auto-messages

### 3. `src/pages/LaLiga.tsx`
- Same structure as `WorldCup.tsx` but queries `matches` table for `competition = 'PD'`
- Fetches upcoming/live/finished matches ordered by date
- Auto-selects the "best" match: prioritize LIVE > today > next upcoming; within same timeslot, prefer Real Madrid or Barcelona
- Horizontal match picker at top for switching between same-day matches
- Passes selected match data (team names, scores, status, utc_date) to `LaLigaMatchHub`

### 4. `src/components/laliga/LaLigaMatchHub.tsx`
- Copy of `MatchHub.tsx` adapted to accept dynamic match props
- Hero: team initials in large circles instead of emoji flags (La Liga teams don't have emoji flags)
- Phase auto-derived from match `status`: SCHEDULED/TIMED -> pre, IN_PLAY/PAUSED -> live, FINISHED -> post (phase toggle still available for prototype testing)
- Countdown computed from real `utc_date` in Baghdad timezone
- Scores from `score_home`/`score_away`
- Match title uses Arabic team names from `team_translations`
- Tags: "الدوري الإسباني", "تعليق عربي", "2025/26"
- Action buttons: "شاهد على فدشي 📺" (not TOD), and in live phase this scrolls to the embedded player

### 5. `src/components/laliga/LaLigaPreGame.tsx`
- Copy of `PreGame.tsx` with:
  - فدشي logo/branding instead of TOD
  - "شاهد الدوري الإسباني مباشرة على فدشي" subscription card
  - "شاهد الآن" button (in-app, not external redirect)
  - Dynamic team names in prediction labels (from match props)
  - La Liga chat messages and quizzes from `laligaMockData.ts`

### 6. `src/components/laliga/LaLigaInGame.tsx`
- Copy of `InGame.tsx` with:
  - **Dummy video player** at the top: a dark 16:9 rectangle with a play button overlay and "مباشر على فدشي" badge -- representing the in-app stream
  - La Liga chat messages and quizzes
  - فدشي branding throughout

### 7. `src/components/laliga/LaLigaPostGame.tsx`
- Copy of `PostGame.tsx` with dynamic team names and scores from match data

## Files to Modify

### 8. `src/App.tsx`
- Add `/la-liga` route pointing to `LaLiga` page (no auth required)

## Match Selection Logic

```text
1. Query: matches WHERE competition='PD' AND match_date >= today, ORDER BY utc_date ASC, LIMIT 30
2. Group by match_date
3. For the nearest matchday with matches:
   a. If any match is IN_PLAY/PAUSED → select it (prefer RM/Barca if multiple live)
   b. Else pick TIMED/SCHEDULED match where home_team or away_team contains "Real Madrid" or "Barcelona"
   c. Else pick the first match of the day
4. Show all same-day matches in horizontal picker for manual switching
5. Only the selected match gets the full engagement layer (chat, quizzes, predictions)
```

## Dummy Video Player (Live Phase)

A styled placeholder box at the top of `LaLigaInGame`:
- Dark background (16:9 aspect ratio)
- Centered play triangle icon
- "مباشر" red badge in corner
- "فدشي" watermark
- Tapping shows a toast: "البث المباشر سيتوفر قريباً" (Coming soon)

## No Database Changes Required
- `matches` and `team_translations` tables already have public SELECT RLS policies
- No new tables needed

## Shared Components (reused, not copied)
- `StatusBar`, `BottomTabBar`, `PhaseIndicator`, `MiniLeaderboard`, `UserStatsCard`
- `pointsStore` (same points system across both experiences)

