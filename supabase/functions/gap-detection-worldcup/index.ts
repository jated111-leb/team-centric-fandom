// ============================================================================
// gap-detection-worldcup
// ----------------------------------------------------------------------------
// Hourly check: for each featured WC match kicking off in the next 24h,
// compute the EXPECTED set of target teams (featured home + featured away +
// Iraq safety-net) and compare to the set of target_team_canonical present
// in wc_schedule_ledger. Logs one gap per missing team.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Load featured teams + feature flags (mirror scheduler's targeting logic)
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('canonical_name, iso_code, enabled');
    const featuredByCanonical = new Map(
      featuredTeams?.filter(t => t.enabled).map(t => [t.canonical_name, t]) ?? []
    );

    const { data: flagRows } = await supabase
      .from('wc_feature_flags')
      .select('key, enabled');
    const flag = (k: string) =>
      flagRows?.find(f => f.key === k)?.enabled === true;
    const iraqSafetyNet  = flag('iraq_safety_net_enabled');
    const iraqEliminated = flag('iraq_eliminated');

    const { data: upcoming, error } = await supabase
      .from('wc_matches')
      .select('id, football_data_id, home_team_canonical, away_team_canonical, home_team_iso, away_team_iso, kickoff_utc, stage')
      .eq('featured_match', true)
      .gte('kickoff_utc', now.toISOString())
      .lte('kickoff_utc', next24h.toISOString())
      .in('status', ['SCHEDULED', 'TIMED']);

    if (error) throw error;

    const gaps: { match: any; missing_team: string }[] = [];

    for (const match of upcoming ?? []) {
      // Compute expected target teams (must mirror braze-worldcup-scheduler)
      const expected = new Set<string>();
      if (featuredByCanonical.has(match.home_team_canonical))
        expected.add(match.home_team_canonical);
      if (featuredByCanonical.has(match.away_team_canonical))
        expected.add(match.away_team_canonical);
      if (iraqSafetyNet && !iraqEliminated) {
        if (match.home_team_iso === 'IRQ') expected.add('Iraq');
        if (match.away_team_iso === 'IRQ') expected.add('Iraq');
      }
      if (iraqEliminated) expected.delete('Iraq');
      if (expected.size === 0) continue;

      const { data: ledgerRows } = await supabase
        .from('wc_schedule_ledger')
        .select('target_team_canonical')
        .eq('match_id', match.id)
        .in('status', ['queued', 'sent_to_braze', 'delivered']);
      const present = new Set(ledgerRows?.map(r => r.target_team_canonical) ?? []);

      for (const team of expected) {
        if (present.has(team)) continue;
        gaps.push({ match, missing_team: team });
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'gap-detection-worldcup',
          log_level: 'warn',
          match_id: match.id,
          message: `GAP — featured WC match within 24h has no ledger row for ${team}`,
          context: {
            match_id: match.id,
            missing_team: team,
            expected_teams: Array.from(expected),
            present_teams: Array.from(present),
            home: match.home_team_canonical,
            away: match.away_team_canonical,
            kickoff_utc: match.kickoff_utc,
            stage: match.stage,
          },
        });
      }
    }

    // Auto-trigger scheduler if any gaps found, to self-heal
    if (gaps.length > 0) {
      try {
        await supabase.functions.invoke('braze-worldcup-scheduler');
      } catch (err) {
        console.error('Failed to chain-trigger scheduler from gap detection:', err);
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'gap-detection-worldcup',
      log_level: 'info',
      message: `Checked ${upcoming?.length ?? 0} upcoming featured matches, found ${gaps.length} per-team gaps`,
      context: { checked: upcoming?.length ?? 0, gaps: gaps.length },
    });

    return new Response(
      JSON.stringify({ checked: upcoming?.length ?? 0, gaps: gaps.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('gap-detection-worldcup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
