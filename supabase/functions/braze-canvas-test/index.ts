import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { formatInTimeZone, toZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

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

    // Prepare canvas entry properties (match scheduler keys + backwards-compatible aliases)
    const kickoffDate = new Date(match.utc_date);
    const BAGHDAD_TIMEZONE = 'Asia/Baghdad';
    const baghdadTime = toZonedTime(kickoffDate, BAGHDAD_TIMEZONE);

    // Helper to convert digits to Arabic numerals
    const toArabicDigits = (str: string) => {
      const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return str.replace(/\d/g, (d) => arabicDigits[parseInt(d)]);
    };

    // kickoff_ar: "الساعة ٨:٠٠ م ٢٥-١١-٢٠٢٥ (توقيت بغداد)"
    const hours24 = baghdadTime.getHours();
    const minutes = baghdadTime.getMinutes();
    const hours12 = hours24 % 12 || 12;
    const ampm = hours24 < 12 ? 'ص' : 'م';
    const day = baghdadTime.getDate();
    const month = baghdadTime.getMonth() + 1;
    const year = baghdadTime.getFullYear();
    const timeStr = `${hours12}:${minutes.toString().padStart(2, '0')}`;
    const dateStr = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
    const kickoff_ar = toArabicDigits(`الساعة ${timeStr} ${ampm} ${dateStr} (توقيت بغداد)`);

    const kickoff_baghdad = formatInTimeZone(kickoffDate, BAGHDAD_TIMEZONE, 'yyyy-MM-dd HH:mm');

    const canvasEntryProperties = {
      // Scheduler keys
      match_id: match.id.toString(),
      competition_key: match.competition,
      competition_en: match.competition_name,
      competition_ar: competitionAr,
      home_en: match.home_team,
      away_en: match.away_team,
      home_ar: homeTeamAr,
      away_ar: awayTeamAr,
      kickoff_utc: match.utc_date,
      kickoff_baghdad,
      kickoff_ar,
      sig: `test-${match.id}-${Date.now()}`,

      // Backwards-compatible aliases (in case the Canvas uses these names)
      home_team: match.home_team,
      away_team: match.away_team,
      home_team_ar: homeTeamAr,
      away_team_ar: awayTeamAr,
      competition: match.competition_name,
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
