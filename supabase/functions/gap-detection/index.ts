import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const fortyEightHoursOut = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    console.log(`🔍 Gap Detection: Checking matches from ${now.toISOString()} to ${fortyEightHoursOut.toISOString()}`);

    // Fetch upcoming matches in the next 48 hours
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .gte('utc_date', now.toISOString())
      .lte('utc_date', fortyEightHoursOut.toISOString())
      .in('status', ['SCHEDULED', 'TIMED'])
      .order('utc_date', { ascending: true });

    if (matchError) throw matchError;

    console.log(`Found ${matches?.length || 0} matches in next 48 hours`);

    // Fetch featured teams
    const { data: featuredTeamsData } = await supabase
      .from('featured_teams')
      .select('team_name');

    const FEATURED_TEAMS = (featuredTeamsData || []).map(t => t.team_name);

    if (FEATURED_TEAMS.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No featured teams configured', gaps: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking against ${FEATURED_TEAMS.length} featured teams`);

    // Fetch team mappings
    const { data: teamMappings } = await supabase
      .from('team_mappings')
      .select('*');

    const findCanonicalTeam = (teamName: string): string | null => {
      const normalized = teamName.toLowerCase();
      for (const mapping of teamMappings || []) {
        const regex = new RegExp(mapping.pattern, 'i');
        if (regex.test(normalized)) {
          return mapping.canonical_name;
        }
      }
      return null;
    };

    // Check each match for gaps
    const gaps = [];
    
    for (const match of matches || []) {
      const homeCanonical = findCanonicalTeam(match.home_team);
      const awayCanonical = findCanonicalTeam(match.away_team);
      
      const homeFeatured = homeCanonical && FEATURED_TEAMS.includes(homeCanonical);
      const awayFeatured = awayCanonical && FEATURED_TEAMS.includes(awayCanonical);
      
      // Skip if no featured teams
      if (!homeFeatured && !awayFeatured) {
        continue;
      }

      // Check if schedule exists
      const { data: schedule } = await supabase
        .from('schedule_ledger')
        .select('*')
        .eq('match_id', match.id)
        .maybeSingle();

      if (!schedule) {
        const kickoffDate = new Date(match.utc_date);
        const hoursUntilKickoff = (kickoffDate.getTime() - now.getTime()) / 3600000;
        
        const gap = {
          match_id: match.id,
          home_team: match.home_team,
          away_team: match.away_team,
          competition: match.competition,
          kickoff_utc: match.utc_date,
          hours_until_kickoff: Math.round(hoursUntilKickoff * 10) / 10,
          featured_teams: [
            homeFeatured ? homeCanonical : null,
            awayFeatured ? awayCanonical : null
          ].filter(t => t !== null),
        };
        
        gaps.push(gap);
        
        console.log(`⚠️ GAP DETECTED: Match ${match.id} - ${match.home_team} vs ${match.away_team} (${hoursUntilKickoff.toFixed(1)}h until kickoff)`);
        
        // Log the gap
        await supabase.from('scheduler_logs').insert({
          function_name: 'gap-detection',
          match_id: match.id,
          action: 'gap_detected',
          reason: `Missing schedule for featured team match in ${hoursUntilKickoff.toFixed(1)}h`,
          details: gap,
        });
      }
    }

    console.log(`Gap detection complete: found ${gaps.length} gaps`);

    // AUTO-FIX: If gaps found, trigger scheduler to fix them
    let schedulerTriggered = false;
    if (gaps.length > 0) {
      console.log(`🔧 AUTO-FIX: Triggering braze-scheduler to fix ${gaps.length} gaps...`);
      try {
        const { data: schedulerResult, error: schedulerError } = await supabase.functions.invoke('braze-scheduler');
        if (schedulerError) {
          console.error('Failed to trigger scheduler for auto-fix:', schedulerError);
        } else {
          schedulerTriggered = true;
          console.log('✅ Scheduler triggered for auto-fix:', schedulerResult);
          
          await supabase.from('scheduler_logs').insert({
            function_name: 'gap-detection',
            action: 'auto_fix_triggered',
            reason: `Triggered scheduler to fix ${gaps.length} gaps`,
            details: {
              gaps_found: gaps.length,
              scheduler_result: schedulerResult,
            },
          });
        }
      } catch (error) {
        console.error('Error triggering scheduler for auto-fix:', error);
      }
    }

    // Create a summary log
    await supabase.from('scheduler_logs').insert({
      function_name: 'gap-detection',
      action: 'scan_complete',
      reason: `Scanned ${matches?.length || 0} matches, found ${gaps.length} gaps${schedulerTriggered ? ', triggered scheduler' : ''}`,
      details: {
        total_matches: matches?.length || 0,
        gaps_found: gaps.length,
        scan_window_hours: 48,
        scheduler_triggered: schedulerTriggered,
      },
    });

    return new Response(
      JSON.stringify({ 
        gaps,
        total_matches_scanned: matches?.length || 0,
        gaps_found: gaps.length,
        scheduler_triggered: schedulerTriggered,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in gap-detection:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
