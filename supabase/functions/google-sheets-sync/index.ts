import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const COMPETITION_MAP: Record<string, string> = {
  PD: 'LaLiga',
  PL: 'Premier League',
  SA: 'Serie A',
  FL1: 'Ligue 1',
  DED: 'Eredivisie',
  CL: 'Champions League',
  EL: 'Europa League',
  ECL: 'Conference League',
  ELC: 'Carabao Cup',
};

const HEADERS = [
  'Match ID', 'Competition', 'Competition (AR)', 'Matchday', 'Date', 'Time (Baghdad)',
  'Home Team', 'Home Team (AR)', 'Away Team', 'Away Team (AR)',
  'Status', 'Score', 'Stage', 'Priority', 'Priority Score', 'Reason', 'Last Synced',
];

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

function matchToRow(m: any, teamMap: Map<string, string>, compMap: Map<string, string>): string[] {
  return [
    m.id.toString(),
    m.competition_name || m.competition,
    compMap.get(m.competition) || '',
    m.matchday || '',
    m.match_date,
    m.match_time || '',
    m.home_team,
    teamMap.get(m.home_team) || m.home_team,
    m.away_team,
    teamMap.get(m.away_team) || m.away_team,
    m.status,
    m.score_home != null && m.score_away != null ? `${m.score_home}-${m.score_away}` : '',
    m.stage || '',
    m.priority,
    m.priority_score?.toString() || '0',
    m.priority_reason || '',
    new Date().toISOString(),
  ];
}

interface SyncResult {
  sheetName: string;
  updated: number;
  appended: number;
  total: number;
}

async function syncSheet(
  sheetName: string,
  matches: any[],
  teamMap: Map<string, string>,
  compMap: Map<string, string>,
  sheetsApiBase: string,
  authHeaders: Record<string, string>,
  clearSheet: boolean,
): Promise<SyncResult> {
  const encodedName = encodeURIComponent(sheetName);

  // Clear if requested
  if (clearSheet) {
    await fetch(`${sheetsApiBase}/values/${encodedName}!A:Z:clear`, {
      method: 'POST',
      headers: authHeaders,
    });
    await fetch(`${sheetsApiBase}/values/${encodedName}!A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ range: `${sheetName}!A1`, majorDimension: 'ROWS', values: [HEADERS] }),
    });
  }

  // Read existing data
  const getResponse = await fetch(`${sheetsApiBase}/values/${encodedName}!A:Q`, { headers: authHeaders });
  if (!getResponse.ok) {
    const err = await getResponse.text();
    console.warn(`⚠️ Could not read sheet "${sheetName}": ${err}. Skipping.`);
    return { sheetName, updated: 0, appended: 0, total: matches.length };
  }

  let existingRows: string[][] = [];
  const getData = await getResponse.json();
  existingRows = getData.values || [];

  // Build matchId → row number map
  const existingMap = new Map<string, number>();
  for (let i = 1; i < existingRows.length; i++) {
    const matchId = existingRows[i][0];
    if (matchId) existingMap.set(matchId, i + 1);
  }

  // Write headers if empty
  if (existingRows.length === 0) {
    await fetch(`${sheetsApiBase}/values/${encodedName}!A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ range: `${sheetName}!A1`, majorDimension: 'ROWS', values: [HEADERS] }),
    });
  }

  // Separate updates vs appends
  const updateData: { range: string; values: string[][] }[] = [];
  const appendRows: string[][] = [];

  for (const m of matches) {
    const row = matchToRow(m, teamMap, compMap);
    const matchId = m.id.toString();
    const existingRowNum = existingMap.get(matchId);

    if (existingRowNum) {
      updateData.push({
        range: `${sheetName}!A${existingRowNum}:Q${existingRowNum}`,
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
      console.error(`Batch update failed for "${sheetName}": ${err}`);
    } else {
      updatedCount = updateData.length;
    }
  }

  // Append new rows
  if (appendRows.length > 0) {
    const appendRes = await fetch(
      `${sheetsApiBase}/values/${encodedName}!A:Q:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ majorDimension: 'ROWS', values: appendRows }),
      }
    );
    if (!appendRes.ok) {
      const err = await appendRes.text();
      console.error(`Append failed for "${sheetName}": ${err}`);
    } else {
      appendedCount = appendRows.length;
    }
  }

  return { sheetName, updated: updatedCount, appended: appendedCount, total: matches.length };
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

    // Fetch ALL matches with pagination
    let allMatches: any[] = [];
    let offset = 0;
    while (true) {
      const { data, error: matchError } = await supabase
        .from('matches')
        .select('*')
        .order('match_date', { ascending: false })
        .order('match_time', { ascending: false })
        .range(offset, offset + 999);
      if (matchError) throw matchError;
      if (!data || data.length === 0) break;
      allMatches.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    console.log(`Fetched ${allMatches.length} total matches`);

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

    // Phase 1: Sync all matches to Sheet1
    const sheet1Result = await syncSheet('All-Leagues', allMatches, teamMap, compMap, sheetsApiBase, authHeaders, clearSheet);
    console.log(`✅ Sheet1: ${sheet1Result.updated} updated, ${sheet1Result.appended} appended`);

    // Phase 2: Sync per-league tabs
    const leagueResults: SyncResult[] = [];
    const grouped: Record<string, any[]> = {};
    for (const m of allMatches) {
      const code = m.competition;
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(m);
    }

    for (const [code, matches] of Object.entries(grouped)) {
      const tabName = COMPETITION_MAP[code];
      if (!tabName) {
        console.log(`No tab mapping for competition code "${code}", skipping`);
        continue;
      }
      const result = await syncSheet(tabName, matches, teamMap, compMap, sheetsApiBase, authHeaders, clearSheet);
      leagueResults.push(result);
      console.log(`✅ ${tabName}: ${result.updated} updated, ${result.appended} appended (${result.total} matches)`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sheet1: sheet1Result,
        leagues: leagueResults,
        total: allMatches.length,
      }),
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
