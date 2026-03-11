# Saved Games Deeplink Generator — Specification

## Overview

Generate deeplinks to saved games on 1001.tv for use in Braze push notifications and campaigns.

## Deeplink Template

```
https://1001.tv/{assetTypeExternal}/{url_safe_title}/{contentId}
```

### Field Derivation

| Field | Source | Example |
|---|---|---|
| `assetTypeExternal` | From API metadata (e.g. `movie`, `series`, `episode`, `clip`) | `movie` |
| `url_safe_title` | `name` field → lowercased, spaces replaced with `-`, special chars stripped | `al-ahli-vs-al-hilal` |
| `contentId` | Unique content ID from the API | `abc123` |

### Example

- **Input**: `name = "Al Ahli vs Al Hilal"`, `assetTypeExternal = "movie"`, `contentId = "abc123"`
- **Output**: `https://1001.tv/movie/al-ahli-vs-al-hilal/abc123`

## Critical Gotchas

1. **Slug generation**: Arabic characters, diacritics, and special characters must be handled. Transliteration or stripping may be needed.
2. **Asset type mapping**: The `assetTypeExternal` value must match exactly what 1001.tv expects in the URL path.
3. **Validation**: Generated links should be validated (HTTP HEAD check) before being used in campaigns.
4. **API Authentication**: The `api-gateway.1001.tv/mika/api/playlists` endpoint requires signature-based authentication (`INVALID_SIGNATURE` error without it). You need either:
   - An API key / Bearer token
   - HMAC signature mechanism details
   - Specific required headers or query parameters

## Data Sources

### Option A — Database Mode (Supabase)

- Create a `saved_games` table with columns: `content_id`, `asset_type`, `name`, `home_team`, `away_team`, `kickoff_time`, `deeplink`
- Edge function fetches from 1001.tv API periodically and upserts
- Deeplinks are precomputed on insert/update

### Option B — CSV Upload Mode

- Upload a CSV with columns: `contentId`, `assetTypeExternal`, `name`
- Frontend parses and generates deeplinks client-side
- Export results as CSV or copy to clipboard

## Product Spec

### Inputs
- Content metadata from 1001.tv API (or CSV upload)
- Fields required: `contentId`, `assetTypeExternal`, `name`

### Processing
1. Fetch or receive content metadata
2. Generate URL-safe slug from `name`
3. Construct deeplink using template
4. Optionally validate link (HTTP HEAD)

### Outputs
- Table of games with generated deeplinks
- Copy-to-clipboard for individual links
- Bulk export as CSV
- Direct integration with Braze campaign properties

### Controls
- Filter by date range, competition, team
- Search by team name
- Toggle between database and CSV modes

## Upgrade Suggestions

1. **Precompute Service**: Edge function runs on a cron, fetches new content from 1001.tv, generates and stores deeplinks automatically.
2. **Canonical Slug Lookup**: Store a mapping of `contentId → canonical_slug` to avoid regenerating slugs and handle edge cases.
3. **Playlist Mode**: Support generating deeplinks for entire playlists/matchday collections, not just individual games.

## Ready-to-Use Lovable Prompt

> Build a "Saved Games Deeplink Generator" page in the admin panel. It should:
> 1. Accept a CSV upload with columns `contentId`, `assetTypeExternal`, `name` (for games on 1001.tv)
> 2. Generate deeplinks using the template `https://1001.tv/{assetTypeExternal}/{slug}/{contentId}` where slug is derived from the name field (lowercased, spaces to hyphens, special chars stripped)
> 3. Display results in a table with columns: Name, Asset Type, Content ID, Generated Deeplink
> 4. Allow copying individual links and bulk CSV export
> 5. Add a search/filter bar to find specific games
> 6. Use the existing admin layout and design system

## API Reference

- **Endpoint**: `https://api-gateway.1001.tv/mika/api/playlists`
- **Auth**: Requires signature (details TBD — returns `INVALID_SIGNATURE` without proper auth headers)
- **Expected Response**: Array of content items with `contentId`, `assetTypeExternal`, `name`, and other metadata
