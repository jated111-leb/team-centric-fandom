import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';

const COMPETITION_CODES = {
  'PD': 'LaLiga',
  'PL': 'Premier_League',
  'SA': 'Serie_A',
  'FL1': 'Ligue_1',
  'DED': 'Dutch_League_starzplay',
  'CL': 'Champions_League',
  'EL': 'Europa_League',
  'ECL': 'Europa_Conference',
  'ELC': 'Carabao_Cup'
};

const FEATURED_TEAMS = [
  'Real Madrid CF',
  'FC Barcelona',
  'Manchester City FC',
  'Manchester United FC',
  'Liverpool FC',
  'Arsenal FC',
  'FC Bayern München',
  'Paris Saint-Germain FC',
  'Juventus FC',
  'Inter Milan',
];

function isStarTeam(teamName: string): boolean {
  return FEATURED_TEAMS.includes(teamName);
}

function calculatePriority(match: any, competition: string): { priority: string, score: number, reason: string } {
  let score = 0;
  const reasons: string[] = [];
  
  // Champions League or Finals
  if (competition === 'CL' || match.stage?.toLowerCase().includes('final')) {
    score += 5;
    reasons.push('Champions League/Final');
  }
  
  // Star teams
  if (isStarTeam(match.homeTeam.name) || isStarTeam(match.awayTeam.name)) {
    score += 3;
    reasons.push('Star team');
  }
  
  // Prime time (19:30-22:00 Baghdad time = 16:30-19:00 UTC)
  const matchDate = new Date(match.utcDate);
  const hour = matchDate.getUTCHours();
  if (hour >= 16.5 && hour <= 19) {
    score += 2;
    reasons.push('Prime time');
  }
  
  // Knockout stage
  if (match.stage && (match.stage.includes('QUARTER') || match.stage.includes('SEMI') || match.stage.includes('FINAL'))) {
    score += 2;
    reasons.push('Knockout stage');
  }
  
  let priority = 'Low';
  if (score >= 4) priority = 'High';
  else if (score >= 2) priority = 'Medium';
  
  return {
    priority,
    score,
    reason: reasons.join(', ') || 'Regular match'
  };
}

function formatMatchForDB(match: any, competition: string, competitionName: string) {
  const utcDate = new Date(match.utcDate);
  
  // Convert to Baghdad time (UTC+3)
  const baghdadDate = new Date(utcDate.getTime() + (3 * 60 * 60 * 1000));
  const matchDate = baghdadDate.toISOString().split('T')[0];
  const matchTime = baghdadDate.toTimeString().split(' ')[0].slice(0, 5);
  
  const priorityData = calculatePriority(match, competition);
  
  return {
    id: match.id,
    competition,
    competition_name: competitionName,
    matchday: match.matchday?.toString() || match.stage || null,
    match_date: matchDate,
    match_time: matchTime,
    utc_date: match.utcDate,
    home_team: match.homeTeam.name,
    away_team: match.awayTeam.name,
    home_team_id: match.homeTeam.id,
    away_team_id: match.awayTeam.id,
    status: match.status,
    score_home: match.score?.fullTime?.home,
    score_away: match.score?.fullTime?.away,
    stage: match.stage || 'Regular Season',
    priority: priorityData.priority,
    priority_score: priorityData.score,
    priority_reason: priorityData.reason,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const footballApiKey = Deno.env.get('FOOTBALL_API_KEY')!;
    
    if (!footballApiKey) {
      throw new Error('Missing FOOTBALL_API_KEY environment variable');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body first
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // Check for cron secret first (for automated runs)
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCronCall = body.cron_secret && cronSecret && body.cron_secret === cronSecret;

    if (isCronCall) {
      console.log('✅ Authenticated via cron secret');
    } else {
      // Verify admin role for manual calls
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Missing authorization header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);

      if (userError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid token or user not found' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (roleError || !roleData || roleData.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('✅ Authenticated via admin JWT');
    }

    const { daysAhead = 30, competitions = Object.keys(COMPETITION_CODES) } = body;

    const dateFrom = new Date();
    const dateTo = new Date();
    dateTo.setDate(dateTo.getDate() + daysAhead);

    const results: Record<string, number> = {};

    console.log(`Syncing matches for ${competitions.length} competitions from ${dateFrom.toISOString()} to ${dateTo.toISOString()}`);

    for (const compCode of competitions) {
      try {
        const compName = COMPETITION_CODES[compCode as keyof typeof COMPETITION_CODES];
        if (!compName) continue;

        console.log(`Fetching ${compCode} matches...`);

        const response = await fetch(
          `${FOOTBALL_API_BASE}/competitions/${compCode}/matches?dateFrom=${dateFrom.toISOString().split('T')[0]}&dateTo=${dateTo.toISOString().split('T')[0]}`,
          {
            headers: {
              'X-Auth-Token': footballApiKey
            }
          }
        );

        if (!response.ok) {
          console.error(`Failed to fetch ${compCode}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const matches = data.matches || [];

        console.log(`Found ${matches.length} matches for ${compCode}`);

        for (const match of matches) {
          const matchData = formatMatchForDB(match, compCode, compName);

          // DUPLICATE DETECTION: Check for potential duplicate matches (same teams/date, different ID)
          const matchDate = new Date(match.utcDate).toISOString().split('T')[0];
          const { data: potentialDupes } = await supabase
            .from('matches')
            .select('id, home_team, away_team, match_date, utc_date')
            .eq('home_team', match.homeTeam.name)
            .eq('away_team', match.awayTeam.name)
            .eq('match_date', matchDate)
            .neq('id', match.id);

          if (potentialDupes && potentialDupes.length > 0) {
            console.warn(`⚠️ POTENTIAL DUPLICATE MATCH DETECTED:`);
            console.warn(`  New: ID ${match.id} - ${match.homeTeam.name} vs ${match.awayTeam.name} @ ${match.utcDate}`);
            potentialDupes.forEach(dupe => {
              console.warn(`  Existing: ID ${dupe.id} - ${dupe.home_team} vs ${dupe.away_team} @ ${dupe.utc_date}`);
            });
            
            // Log to scheduler_logs for alerting
            await supabase.from('scheduler_logs').insert({
              function_name: 'sync-football-data',
              match_id: match.id,
              action: 'potential_duplicate_match',
              reason: `Match may be duplicate of ID(s): ${potentialDupes.map(d => d.id).join(', ')}`,
              details: {
                new_match_id: match.id,
                existing_match_ids: potentialDupes.map(d => d.id),
                home_team: match.homeTeam.name,
                away_team: match.awayTeam.name,
                match_date: matchDate,
              },
            });
          }

          const { error } = await supabase
            .from('matches')
            .upsert(matchData, {
              onConflict: 'id',
              ignoreDuplicates: false
            });

          if (error) {
            console.error(`Error upserting match ${match.id}:`, error);
          }
        }

        results[compCode] = matches.length;

        // Rate limiting: wait 1 second between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error processing ${compCode}:`, error);
        results[compCode] = 0;
      }
    }

    console.log('Sync completed:', results);

    // Trigger scheduler immediately after sync to catch same-day matches
    console.log('🔄 Triggering braze-scheduler after sync...');
    try {
      const { data: schedulerResult, error: schedulerError } = await supabase.functions.invoke('braze-scheduler');
      if (schedulerError) {
        console.error('Failed to trigger scheduler:', schedulerError);
      } else {
        console.log('✅ Scheduler triggered successfully:', schedulerResult);
      }
    } catch (error) {
      console.error('Error triggering scheduler:', error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        total: Object.values(results).reduce((a, b) => a + b, 0),
        scheduler_triggered: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
