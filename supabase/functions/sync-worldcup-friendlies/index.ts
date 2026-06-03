// ============================================================================
// sync-worldcup-friendlies
// ----------------------------------------------------------------------------
// Fetches PRE-WORLD-CUP international friendlies for every featured WC nation
// and upserts them into wc_matches with featured_match=true so they flow
// through the existing braze-worldcup-scheduler / Canvas / webhook pipeline.
//
// Discovery strategy (football-data.org free tier has no global "friendlies"
// feed):
//   1. Call /competitions/WC/teams to get the official tournament squad list
//      with football_data_id values.
//   2. Match each returned team to a wc_featured_teams row by:
//        a. exact wc_team_mappings.football_data_id (if present)
//        b. wc_team_mappings.football_data_name (case-insensitive)
//        c. iso3 → tla mapping fallback
//   3. For each matched team, GET /teams/{id}/matches?status=SCHEDULED
//      between today and 2026-06-10 (the day before WC kicks off).
//   4. Skip rows whose competition.code === 'WC' (those are handled by
//      sync-worldcup-data) and any football_data_id already seen this run.
//   5. Upsert with competition_code from the API (typically 'FRIENDLY' or a
//      qualifier code), featured_match=true, status from API.
//
// Throttling: football-data free tier is 10 req/min. We sleep 7s between
// team-fixture calls and bail early on 429.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronOrAdmin } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';
const WC_COMPETITION_CODE = 'WC';
const FRIENDLY_WINDOW_END = '2026-06-10'; // day before WC kickoff
const REQUEST_GAP_MS = 7000;              // ~9 req/min cap

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Best-effort venue → IANA timezone map (shared with sync-worldcup-data).
const VENUE_TIMEZONES: Record<string, string> = {
  'Wembley Stadium': 'Europe/London',
  'Old Trafford': 'Europe/London',
  'Santiago Bernabéu': 'Europe/Madrid',
  'Camp Nou': 'Europe/Madrid',
  'Allianz Arena': 'Europe/Berlin',
  'Parc des Princes': 'Europe/Paris',
  'San Siro': 'Europe/Rome',
  'Maracanã': 'America/Sao_Paulo',
  'MetLife Stadium': 'America/New_York',
  'SoFi Stadium': 'America/Los_Angeles',
  'Estadio Azteca': 'America/Mexico_City',
};

function inferVenueTimezone(venue: string | null): string | null {
  if (!venue) return null;
  if (VENUE_TIMEZONES[venue]) return VENUE_TIMEZONES[venue];
  for (const [name, tz] of Object.entries(VENUE_TIMEZONES)) {
    if (venue.toLowerCase().includes(name.toLowerCase().split(' ')[0])) return tz;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauth = await requireCronOrAdmin(req, corsHeaders);
  if (unauth) return unauth;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Feature flag gate
    const { data: flagRow } = await supabase
      .from('wc_feature_flags')
      .select('enabled')
      .eq('key', 'friendlies_sync_enabled')
      .maybeSingle();
    if (flagRow && flagRow.enabled === false) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'friendlies_sync_enabled=false' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const footballApiKey = Deno.env.get('FOOTBALL_API_KEY');
    if (!footballApiKey) throw new Error('Missing FOOTBALL_API_KEY');

    // ---- Load featured teams + mappings ----
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('id, canonical_name, iso_code, priority_flag, enabled')
      .eq('enabled', true);

    const { data: mappings } = await supabase
      .from('wc_team_mappings')
      .select('featured_team_id, football_data_name, football_data_id');

    const enabledFeatured = featuredTeams ?? [];
    const teamById = new Map(enabledFeatured.map((t) => [t.id, t]));
    const idLookup = new Map<number, string>();
    const nameLookup = new Map<string, string>();
    for (const m of mappings ?? []) {
      if (m.football_data_id != null) idLookup.set(m.football_data_id, m.featured_team_id);
      if (m.football_data_name) nameLookup.set(m.football_data_name.toLowerCase(), m.featured_team_id);
    }
    const isoLookup = new Map<string, string>();
    for (const t of enabledFeatured) {
      if (t.iso_code) isoLookup.set(t.iso_code.toUpperCase(), t.id);
    }

    // ---- Step 1: discover team IDs via /competitions/WC/teams ----
    const teamsRes = await fetch(`${FOOTBALL_API_BASE}/competitions/${WC_COMPETITION_CODE}/teams`, {
      headers: { 'X-Auth-Token': footballApiKey },
    });
    if (!teamsRes.ok) {
      const txt = await teamsRes.text();
      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'sync-worldcup-friendlies',
        log_level: 'error',
        message: `WC teams discovery failed: ${teamsRes.status}`,
        context: { status: teamsRes.status, body: txt.slice(0, 500) },
      });
      throw new Error(`WC teams discovery returned ${teamsRes.status}`);
    }
    const teamsJson = await teamsRes.json();
    const wcTeams: Array<{ id: number; name: string; tla?: string }> = teamsJson.teams || [];

    // Match WC API teams → our featured_team_id
    const resolved: Array<{ fdId: number; fdName: string; featuredTeamId: string; canonical: string }> = [];
    for (const apiTeam of wcTeams) {
      let featuredTeamId: string | undefined;
      if (idLookup.has(apiTeam.id)) featuredTeamId = idLookup.get(apiTeam.id);
      else if (apiTeam.name && nameLookup.has(apiTeam.name.toLowerCase())) {
        featuredTeamId = nameLookup.get(apiTeam.name.toLowerCase());
      } else if (apiTeam.tla && isoLookup.has(apiTeam.tla.toUpperCase())) {
        featuredTeamId = isoLookup.get(apiTeam.tla.toUpperCase());
      }
      if (!featuredTeamId) continue;
      const ft = teamById.get(featuredTeamId);
      if (!ft) continue;
      resolved.push({
        fdId: apiTeam.id,
        fdName: apiTeam.name,
        featuredTeamId,
        canonical: ft.canonical_name,
      });
    }

    if (resolved.length === 0) {
      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'sync-worldcup-friendlies',
        log_level: 'warn',
        message: 'No featured teams matched WC squad list',
        context: { wcTeamsCount: wcTeams.length, featuredCount: enabledFeatured.length },
      });
      return new Response(
        JSON.stringify({ matched: 0, upserted: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ---- Step 2: fetch upcoming fixtures per matched team ----
    const dateFrom = new Date().toISOString().split('T')[0];
    const dateTo = FRIENDLY_WINDOW_END;
    const seenFdIds = new Set<number>();
    let upserted = 0;
    let skippedWc = 0;
    let teamErrors = 0;

    for (let i = 0; i < resolved.length; i++) {
      const team = resolved[i];
      if (i > 0) await sleep(REQUEST_GAP_MS);

      const url = `${FOOTBALL_API_BASE}/teams/${team.fdId}/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${dateTo}`;
      const res = await fetch(url, { headers: { 'X-Auth-Token': footballApiKey } });

      if (res.status === 429) {
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'sync-worldcup-friendlies',
          log_level: 'warn',
          message: `Rate-limited at team ${team.canonical} (#${i}/${resolved.length}) — stopping`,
          context: { fdId: team.fdId },
        });
        break;
      }
      if (!res.ok) {
        teamErrors++;
        continue;
      }
      const json = await res.json();
      const teamMatches: any[] = json.matches || [];

      for (const match of teamMatches) {
        if (seenFdIds.has(match.id)) continue;
        if (match.competition?.code === WC_COMPETITION_CODE) {
          skippedWc++;
          continue;
        }
        seenFdIds.add(match.id);

        // Resolve both sides against featured teams
        const homeApi = match.homeTeam ?? {};
        const awayApi = match.awayTeam ?? {};

        const resolveSide = (api: { id?: number; name?: string; tla?: string }) => {
          let id: string | undefined;
          if (api.id != null && idLookup.has(api.id)) id = idLookup.get(api.id);
          else if (api.name && nameLookup.has(api.name.toLowerCase())) id = nameLookup.get(api.name.toLowerCase());
          else if (api.tla && isoLookup.has(api.tla.toUpperCase())) id = isoLookup.get(api.tla.toUpperCase());
          if (!id) return null;
          const t = teamById.get(id);
          if (!t) return null;
          return { canonical: t.canonical_name, iso: t.iso_code, priority: t.priority_flag };
        };

        const home = resolveSide(homeApi);
        const away = resolveSide(awayApi);
        const featuredMatch = !!(home || away); // always true (this team IS featured)

        const venue = match.venue || null;
        const competitionCode = match.competition?.code || 'FRIENDLY';

        const row: Record<string, unknown> = {
          football_data_id: match.id,
          competition_code: competitionCode,
          home_team_canonical: home?.canonical ?? homeApi.name ?? 'TBD',
          away_team_canonical: away?.canonical ?? awayApi.name ?? 'TBD',
          home_team_iso: home?.iso ?? homeApi.tla ?? null,
          away_team_iso: away?.iso ?? awayApi.tla ?? null,
          kickoff_utc: match.utcDate,
          venue,
          venue_timezone: inferVenueTimezone(venue),
          stage: match.stage || 'FRIENDLY',
          group_letter: null,
          priority_flag: home?.iso === 'IRQ' || away?.iso === 'IRQ' ? 'host_team' : null,
          featured_match: featuredMatch,
          status: match.status || 'SCHEDULED',
          raw_api_payload: match,
          last_synced_at: new Date().toISOString(),
        };

        const { error: upsertErr } = await supabase
          .from('wc_matches')
          .upsert(row, { onConflict: 'football_data_id', ignoreDuplicates: false });
        if (upsertErr) {
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'sync-worldcup-friendlies',
            log_level: 'error',
            message: `Upsert failed for friendly ${match.id}`,
            context: { error: upsertErr.message, football_data_id: match.id },
          });
        } else {
          upserted++;
        }
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'sync-worldcup-friendlies',
      log_level: 'info',
      message: `Friendlies sync complete: ${upserted} upserted`,
      context: {
        matched_teams: resolved.length,
        unique_fixtures: seenFdIds.size,
        upserted,
        skipped_wc: skippedWc,
        team_errors: teamErrors,
        window: { from: dateFrom, to: dateTo },
      },
    });

    // Chain-trigger scheduler so new friendlies get queued immediately
    try {
      await supabase.functions.invoke('braze-worldcup-scheduler', {
        headers: { 'x-cron-secret': Deno.env.get('CRON_SECRET') ?? '' },
      });
    } catch (err) {
      console.error('chain-trigger braze-worldcup-scheduler:', err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        matched_teams: resolved.length,
        unique_fixtures: seenFdIds.size,
        upserted,
        skipped_wc: skippedWc,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('sync-worldcup-friendlies error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
