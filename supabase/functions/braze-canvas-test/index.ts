import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional parameters
    let testUserId = '874810';
    let matchId: number | null = null;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.user_id) testUserId = String(body.user_id);
      if (body.match_id) matchId = Number(body.match_id);
    }

    // Get a real upcoming match if no match_id specified
    let match;
    if (matchId) {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (error) throw new Error(`Match not found: ${matchId}`);
      match = data;
    } else {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .gte('utc_date', new Date().toISOString())
        .order('utc_date', { ascending: true })
        .limit(1)
        .single();
      if (error) throw new Error('No upcoming matches found');
      match = data;
    }

    // Get Arabic translations
    const { data: translations } = await supabase
      .from('team_translations')
      .select('team_name, arabic_name')
      .in('team_name', [match.home_team, match.away_team]);

    const translationMap = new Map(
      (translations || []).map(t => [t.team_name, t.arabic_name])
    );

    const homeTeamAr = translationMap.get(match.home_team) || match.home_team;
    const awayTeamAr = translationMap.get(match.away_team) || match.away_team;

    // Get competition translation
    const { data: compTranslation } = await supabase
      .from('competition_translations')
      .select('arabic_name')
      .eq('competition_code', match.competition)
      .single();

    const competitionAr = compTranslation?.arabic_name || match.competition_name;

    // Prepare canvas entry properties (same as scheduler)
    const canvasEntryProperties = {
      match_id: match.id,
      home_team: match.home_team,
      away_team: match.away_team,
      home_team_ar: homeTeamAr,
      away_team_ar: awayTeamAr,
      competition: match.competition_name,
      competition_ar: competitionAr,
      kickoff_utc: match.utc_date,
      match_date: match.match_date,
      match_time: match.match_time,
    };

    console.log('Sending test Canvas to user:', testUserId);
    console.log('Match:', match.id, match.home_team, 'vs', match.away_team);
    console.log('Canvas entry properties:', canvasEntryProperties);

    // Use immediate send with recipients array for single user test
    const requestBody = {
      canvas_id: brazeCanvasId,
      recipients: [
        { external_user_id: testUserId }
      ],
      canvas_entry_properties: canvasEntryProperties,
    };
    
    const fullUrl = `${brazeEndpoint}/canvas/trigger/send`;
    console.log('Braze endpoint:', brazeEndpoint);
    console.log('Full URL:', fullUrl);
    console.log('Canvas ID:', brazeCanvasId);
    console.log('API Key (first 10 chars):', brazeApiKey?.substring(0, 10) + '...');
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const brazeResponse = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${brazeApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const brazeResult = await brazeResponse.json();
    console.log('Braze HTTP status:', brazeResponse.status);
    console.log('Braze response:', JSON.stringify(brazeResult));

    // Log the test send
    await supabase.from('scheduler_logs').insert({
      function_name: 'braze-canvas-test',
      action: 'test_send',
      match_id: match.id,
      details: {
        user_id: testUserId,
        canvas_id: brazeCanvasId,
        braze_response: brazeResult,
        canvas_entry_properties: canvasEntryProperties,
      },
    });

    return new Response(
      JSON.stringify({
        success: brazeResult.message === 'success',
        user_id: testUserId,
        match: {
          id: match.id,
          home_team: match.home_team,
          away_team: match.away_team,
          kickoff: match.utc_date,
        },
        braze_response: brazeResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in braze-canvas-test:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
