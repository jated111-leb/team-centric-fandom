import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Generate a JWT for Google Sheets API using service account credentials
async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  // Import the private key
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${unsignedToken}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    const sheetId = Deno.env.get('GOOGLE_SHEET_ID');

    if (!serviceAccountJson) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON secret');
    }
    if (!sheetId) {
      throw new Error('Missing GOOGLE_SHEET_ID secret');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check auth for manual calls (skip for internal service-role calls)
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const isInternalCall = body._internal === true;

    if (!isInternalCall) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Missing authorization' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!roleData || roleData.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fetch matches (next 4 weeks, featured teams)
    const today = new Date().toISOString().split('T')[0];
    const fourWeeksOut = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: featuredTeams } = await supabase
      .from('featured_teams')
      .select('team_name');
    const teamNames = (featuredTeams || []).map((t: any) => t.team_name);

    let query = supabase
      .from('matches')
      .select('*')
      .gte('match_date', today)
      .lte('match_date', fourWeeksOut)
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true });

    if (teamNames.length > 0) {
      query = query.or(
        teamNames.map(team => `home_team.eq.${team},away_team.eq.${team}`).join(',')
      );
    }

    const { data: matches, error: matchError } = await query;
    if (matchError) throw matchError;

    // Fetch translations
    const { data: teamTranslations } = await supabase.from('team_translations').select('*');
    const { data: compTranslations } = await supabase.from('competition_translations').select('*');

    const teamMap = new Map((teamTranslations || []).map((t: any) => [t.team_name, t.arabic_name]));
    const compMap = new Map((compTranslations || []).map((c: any) => [c.competition_code, c.arabic_name]));

    // Build rows
    const headers = [
      'Competition', 'Competition (AR)', 'Matchday', 'Date', 'Time (Baghdad)',
      'Home Team', 'Home Team (AR)', 'Away Team', 'Away Team (AR)',
      'Status', 'Score', 'Stage', 'Priority', 'Priority Score', 'Reason',
    ];

    const rows = (matches || []).map((m: any) => [
      m.competition_name || m.competition,
      compMap.get(m.competition) || '',
      m.matchday || '',
      m.match_date,
      m.match_time || '',
      m.home_team,
      teamMap.get(m.home_team) || '',
      m.away_team,
      teamMap.get(m.away_team) || '',
      m.status,
      m.score_home != null && m.score_away != null ? `${m.score_home}-${m.score_away}` : '',
      m.stage || '',
      m.priority,
      m.priority_score?.toString() || '0',
      m.priority_reason || '',
    ]);

    // Authenticate with Google
    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const sheetsApiBase = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

    // Clear the sheet
    await fetch(`${sheetsApiBase}/values/Sheet1!A:Z:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // Write headers + data
    const allRows = [headers, ...rows];
    const writeResponse = await fetch(`${sheetsApiBase}/values/Sheet1!A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: 'Sheet1!A1', majorDimension: 'ROWS', values: allRows }),
    });

    if (!writeResponse.ok) {
      const err = await writeResponse.text();
      throw new Error(`Google Sheets write failed: ${err}`);
    }

    const result = await writeResponse.json();
    console.log(`✅ Google Sheets sync complete: ${rows.length} matches written`);

    return new Response(
      JSON.stringify({ success: true, matchesWritten: rows.length, updatedCells: result.updatedCells }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Google Sheets sync error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
