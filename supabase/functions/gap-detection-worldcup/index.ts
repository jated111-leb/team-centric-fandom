// ============================================================================
// gap-detection-worldcup
// ----------------------------------------------------------------------------
// Hourly check: any featured WC match kicking off in the next 24h that does
// NOT have a corresponding wc_schedule_ledger row gets logged as a warning so
// admins can investigate (or auto-trigger the scheduler).
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

    const { data: upcoming, error } = await supabase
      .from('wc_matches')
      .select('id, football_data_id, home_team_canonical, away_team_canonical, kickoff_utc, stage')
      .eq('featured_match', true)
      .gte('kickoff_utc', now.toISOString())
      .lte('kickoff_utc', next24h.toISOString())
      .in('status', ['SCHEDULED', 'TIMED']);

    if (error) throw error;

    const gaps: any[] = [];

    for (const match of upcoming ?? []) {
      const { data: ledgerRows } = await supabase
        .from('wc_schedule_ledger')
        .select('id')
        .eq('match_id', match.id)
        .limit(1);

      if (!ledgerRows || ledgerRows.length === 0) {
        gaps.push(match);
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'gap-detection-worldcup',
          log_level: 'warn',
          match_id: match.id,
          message: 'GAP — featured WC match within 24h has no ledger row',
          context: {
            match_id: match.id,
            home: match.home_team_canonical,
            away: match.away_team_canonical,
            kickoff_utc: match.kickoff_utc,
            stage: match.stage,
          },
        });
      }
    }

    // Auto-trigger scheduler if gaps found, to self-heal
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
      message: `Checked ${upcoming?.length ?? 0} upcoming featured matches, found ${gaps.length} gaps`,
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
