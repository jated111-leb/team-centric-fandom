// ============================================================================
// sync-worldcup-data
// ----------------------------------------------------------------------------
// Pulls FIFA World Cup 2026 fixtures (competition code "WC") from
// football-data.org and upserts them into the wc_matches table. Resolves each
// team to a wc_featured_teams row via wc_team_mappings, sets featured_match
// and priority_flag, and triggers braze-worldcup-scheduler when done.
//
// This is a DEDICATED WC sync — it does not touch the existing `matches`
// table or the existing club football scheduler.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';
const WC_COMPETITION_CODE = 'WC';
const SYNC_DAYS_AHEAD = 45;

// World Cup tournament window (matches outside this range are ignored)
const WC_WINDOW_START = '2026-06-11';
const WC_WINDOW_END   = '2026-07-19';

// Best-effort venue → IANA timezone map for WC 2026 host stadiums.
// Used for human-readable display in the admin dashboard / push payload.
const VENUE_TIMEZONES: Record<string, string> = {
  // USA
  'MetLife Stadium': 'America/New_York',
  'Mercedes-Benz Stadium': 'America/New_York',
  'Hard Rock Stadium': 'America/New_York',
  'Lincoln Financial Field': 'America/New_York',
  'Gillette Stadium': 'America/New_York',
  'NRG Stadium': 'America/Chicago',
  'AT&T Stadium': 'America/Chicago',
  'Arrowhead Stadium': 'America/Chicago',
  'Lumen Field': 'America/Los_Angeles',
  "Levi's Stadium": 'America/Los_Angeles',
  'SoFi Stadium': 'America/Los_Angeles',
  // Mexico
  'Estadio Azteca': 'America/Mexico_City',
  'Estadio Akron': 'America/Mexico_City',
  'Estadio BBVA': 'America/Monterrey',
  // Canada
  'BMO Field': 'America/Toronto',
  'BC Place': 'America/Vancouver',
};

function inferVenueTimezone(venue: string | null): string | null {
  if (!venue) return null;
  if (VENUE_TIMEZONES[venue]) return VENUE_TIMEZONES[venue];
  // Loose contains-match for venues with slight name variants
  for (const [name, tz] of Object.entries(VENUE_TIMEZONES)) {
    if (venue.toLowerCase().includes(name.toLowerCase().split(' ')[0])) return tz;
  }
  return null;
}

function isKnockoutStage(stage: string | null): boolean {
  if (!stage) return false;
  const upper = stage.toUpperCase();
  return upper.includes('ROUND_OF') ||
         upper.includes('QUARTER') ||
         upper.includes('SEMI') ||
         upper.includes('FINAL') ||
         upper.includes('THIRD');
}

function computePriorityFlag(args: {
  homeIsIraq: boolean;
  awayIsIraq: boolean;
  bothMarquee: boolean;
  isKnockout: boolean;
}): string | null {
  if (args.homeIsIraq || args.awayIsIraq) return 'host_team';
  if (args.isKnockout) return 'knockout';
  if (args.bothMarquee) return 'marquee';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const footballApiKey = Deno.env.get('FOOTBALL_API_KEY');
    if (!footballApiKey) {
      throw new Error('Missing FOOTBALL_API_KEY environment variable');
    }

    // Load featured teams + mappings once
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('id, canonical_name, iso_code, priority_flag, enabled');

    const { data: mappings } = await supabase
      .from('wc_team_mappings')
      .select('featured_team_id, football_data_name, football_data_id, match_pattern');

    const teamById = new Map(featuredTeams?.map(t => [t.id, t]) ?? []);
    const enabledIds = new Set(featuredTeams?.filter(t => t.enabled).map(t => t.id) ?? []);

    // Build lookups: by exact football_data_name, by football_data_id, and patterns
    const exactNameLookup = new Map<string, string>();      // name → featured_team_id
    const idLookup        = new Map<number, string>();      // football_data_id → featured_team_id
    const patternLookup: { regex: RegExp; teamId: string }[] = [];

    for (const m of mappings ?? []) {
      if (m.football_data_name) exactNameLookup.set(m.football_data_name.toLowerCase(), m.featured_team_id);
      if (m.football_data_id != null) idLookup.set(m.football_data_id, m.featured_team_id);
      if (m.match_pattern) patternLookup.push({ regex: new RegExp(m.match_pattern, 'i'), teamId: m.featured_team_id });
    }

    function resolveFeaturedTeam(apiTeam: { id?: number; name?: string }): { teamId: string; canonical: string; iso: string; priority: string | null } | null {
      let teamId: string | undefined;
      if (apiTeam.id != null && idLookup.has(apiTeam.id)) {
        teamId = idLookup.get(apiTeam.id);
      } else if (apiTeam.name && exactNameLookup.has(apiTeam.name.toLowerCase())) {
        teamId = exactNameLookup.get(apiTeam.name.toLowerCase());
      } else if (apiTeam.name) {
        for (const p of patternLookup) {
          if (p.regex.test(apiTeam.name)) {
            teamId = p.teamId;
            break;
          }
        }
      }
      if (!teamId || !enabledIds.has(teamId)) return null;
      const ft = teamById.get(teamId);
      if (!ft) return null;
      return { teamId, canonical: ft.canonical_name, iso: ft.iso_code, priority: ft.priority_flag };
    }

    // Compute date window — sync next SYNC_DAYS_AHEAD days, clamped to WC window
    const now = new Date();
    const dateFrom = now.toISOString().split('T')[0];
    const futureBound = new Date(now.getTime() + SYNC_DAYS_AHEAD * 24 * 60 * 60 * 1000);
    const dateToBound = futureBound.toISOString().split('T')[0];
    const dateTo = dateToBound > WC_WINDOW_END ? WC_WINDOW_END : dateToBound;
    const effectiveFrom = dateFrom < WC_WINDOW_START ? WC_WINDOW_START : dateFrom;

    console.log(`Fetching WC matches from ${effectiveFrom} to ${dateTo}`);

    const url = `${FOOTBALL_API_BASE}/competitions/${WC_COMPETITION_CODE}/matches?dateFrom=${effectiveFrom}&dateTo=${dateTo}`;
    const response = await fetch(url, { headers: { 'X-Auth-Token': footballApiKey } });

    if (!response.ok) {
      const errorText = await response.text();
      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'sync-worldcup-data',
        log_level: 'error',
        message: `Football Data API call failed: ${response.status}`,
        context: { status: response.status, error: errorText, url },
      });
      throw new Error(`Football Data API returned ${response.status}: ${errorText}`);
    }

    const apiData = await response.json();
    const matches = apiData.matches || [];

    console.log(`Football Data returned ${matches.length} WC matches`);

    let upserted = 0;
    let featuredCount = 0;

    for (const match of matches) {
      const home = resolveFeaturedTeam(match.homeTeam ?? {});
      const away = resolveFeaturedTeam(match.awayTeam ?? {});

      const featuredMatch = !!(home || away);
      if (featuredMatch) featuredCount++;

      const homeIsIraq = home?.iso === 'IRQ';
      const awayIsIraq = away?.iso === 'IRQ';
      const bothMarquee = home?.priority === 'marquee' && away?.priority === 'marquee';
      const isKnockout = isKnockoutStage(match.stage);

      const priorityFlag = computePriorityFlag({ homeIsIraq, awayIsIraq, bothMarquee, isKnockout });

      const venue = match.venue || null;
      const venueTimezone = inferVenueTimezone(venue);

      const row = {
        football_data_id:    match.id,
        competition_code:    WC_COMPETITION_CODE,
        home_team_canonical: home?.canonical ?? match.homeTeam?.name ?? 'TBD',
        away_team_canonical: away?.canonical ?? match.awayTeam?.name ?? 'TBD',
        home_team_iso:       home?.iso ?? null,
        away_team_iso:       away?.iso ?? null,
        kickoff_utc:         match.utcDate,
        venue,
        venue_timezone:      venueTimezone,
        stage:               match.stage ?? 'GROUP_STAGE',
        group_letter:        match.group?.replace(/^GROUP_/, '') ?? null,
        priority_flag:       priorityFlag,
        featured_match:      featuredMatch,
        status:              match.status ?? 'SCHEDULED',
        raw_api_payload:     match,
        last_synced_at:      new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('wc_matches')
        .upsert(row, { onConflict: 'football_data_id', ignoreDuplicates: false });

      if (upsertErr) {
        console.error(`Failed to upsert match ${match.id}:`, upsertErr);
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'sync-worldcup-data',
          log_level: 'error',
          message: `Upsert failed for match ${match.id}`,
          context: { error: upsertErr.message, football_data_id: match.id },
        });
      } else {
        upserted++;
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'sync-worldcup-data',
      log_level: 'info',
      message: `Synced ${upserted} matches, ${featuredCount} featured`,
      context: { upserted, featured: featuredCount, fetched: matches.length, dateFrom: effectiveFrom, dateTo },
    });

    // Trigger the WC scheduler immediately so freshly synced matches get queued
    try {
      await supabase.functions.invoke('braze-worldcup-scheduler');
    } catch (err) {
      console.error('Failed to chain-trigger braze-worldcup-scheduler:', err);
    }

    return new Response(
      JSON.stringify({ success: true, upserted, featured: featuredCount, fetched: matches.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('sync-worldcup-data error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
