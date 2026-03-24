import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

const HEADERS = [
  'Match ID', 'Competition', 'Competition (AR)', 'Matchday', 'Date', 'Time (Baghdad)',
  'Home Team', 'Home Team (AR)', 'Away Team', 'Away Team (AR)',
  'Status', 'Score', 'Stage', 'Priority', 'Priority Score', 'Reason', 'Last Synced',
];

function matchToRow(m: any, teamMap: Map<string, string>, compMap: Map<string, string>): string[] {
  return [
    m.id.toString(),
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
    new Date().toISOString(),
  ];
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

    if (!serviceAccountJson) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON secret');
    if (!sheetId) throw new Error('Missing GOOGLE_SHEET_ID secret');

    const supabase = createClient(supabaseUrl, supabaseKey);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const isInternalCall = body._internal === true;
    const clearSheet = body.clearSheet === true;

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

    // Fetch ALL matches (no date filter, no featured-teams filter)
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true })
      .limit(5000);
    if (matchError) throw matchError;

    // Fetch translations
    const { data: teamTranslations } = await supabase.from('team_translations').select('*');
    const { data: compTranslations } = await supabase.from('competition_translations').select('*');

    const teamMap = new Map((teamTranslations || []).map((t: any) => [t.team_name, t.arabic_name]));
    const compMap = new Map((compTranslations || []).map((c: any) => [c.competition_code, c.arabic_name]));

    // Parse service account
    let serviceAccount: any;
    try {
      let cleaned = serviceAccountJson.trim();
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = JSON.parse(cleaned);
      }
      serviceAccount = typeof cleaned === 'string' ? JSON.parse(cleaned) : cleaned;
    } catch {
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON format.');
    }
    const accessToken = await getGoogleAccessToken(serviceAccount);

    const sheetsApiBase = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
    const authHeaders = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

    // If clearSheet requested, wipe everything first
    if (clearSheet) {
      await fetch(`${sheetsApiBase}/values/Sheet1!A:Z:clear`, {
        method: 'POST',
        headers: authHeaders,
      });
      // Write headers
      await fetch(`${sheetsApiBase}/values/Sheet1!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ range: 'Sheet1!A1', majorDimension: 'ROWS', values: [HEADERS] }),
      });
    }

    // Read existing sheet data
    const getResponse = await fetch(`${sheetsApiBase}/values/Sheet1!A:Q`, { headers: authHeaders });
    let existingRows: string[][] = [];
    if (getResponse.ok) {
      const getData = await getResponse.json();
      existingRows = getData.values || [];
    }

    // Build map of matchId → row number (1-indexed in Sheets)
    const existingMap = new Map<string, number>();
    for (let i = 1; i < existingRows.length; i++) { // skip header row
      const matchId = existingRows[i][0];
      if (matchId) existingMap.set(matchId, i + 1); // Sheets rows are 1-indexed
    }

    // If sheet is empty, write headers first
    if (existingRows.length === 0) {
      await fetch(`${sheetsApiBase}/values/Sheet1!A1?valueInputOption=RAW`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ range: 'Sheet1!A1', majorDimension: 'ROWS', values: [HEADERS] }),
      });
    }

    // Separate matches into updates vs appends
    const updateData: { range: string; values: string[][] }[] = [];
    const appendRows: string[][] = [];

    for (const m of (matches || [])) {
      const row = matchToRow(m, teamMap, compMap);
      const matchId = m.id.toString();
      const existingRowNum = existingMap.get(matchId);

      if (existingRowNum) {
        updateData.push({
          range: `Sheet1!A${existingRowNum}:Q${existingRowNum}`,
          values: [row],
        });
      } else {
        appendRows.push(row);
      }
    }

    let updatedCount = 0;
    let appendedCount = 0;

    // Batch update existing rows
    if (updateData.length > 0) {
      const batchRes = await fetch(`${sheetsApiBase}/values:batchUpdate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ valueInputOption: 'RAW', data: updateData }),
      });
      if (!batchRes.ok) {
        const err = await batchRes.text();
        throw new Error(`Batch update failed: ${err}`);
      }
      updatedCount = updateData.length;
    }

    // Append new rows
    if (appendRows.length > 0) {
      const appendRes = await fetch(
        `${sheetsApiBase}/values/Sheet1!A:Q:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ majorDimension: 'ROWS', values: appendRows }),
        }
      );
      if (!appendRes.ok) {
        const err = await appendRes.text();
        throw new Error(`Append failed: ${err}`);
      }
      appendedCount = appendRows.length;
    }

    console.log(`✅ Google Sheets sync: ${updatedCount} updated, ${appendedCount} appended`);

    return new Response(
      JSON.stringify({ success: true, updated: updatedCount, appended: appendedCount, total: (matches || []).length }),
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
