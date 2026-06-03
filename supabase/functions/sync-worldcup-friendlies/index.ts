// ============================================================================
// sync-worldcup-friendlies
// ----------------------------------------------------------------------------
// Reads pre-World-Cup international friendlies from a "WC Friendlies" tab in
// the project's Google Sheet (GOOGLE_SHEET_ID) and upserts them into
// wc_matches with competition_code='FRIENDLY' and featured_match=true so they
// flow through the existing braze-worldcup-scheduler / Canvas / webhook
// pipeline (60-min pre-kickoff reminder).
//
// Why Google Sheet (not football-data.org)?
//   football-data.org free tier (TIER_ONE permission) does NOT expose
//   international friendlies — every /teams/{id}/matches call in the friendly
//   window returns count=0. Manual sheet maintenance is the practical path.
//
// Sheet schema — tab name: "WC Friendlies"
//   A: Kickoff UTC      (ISO-ish: "2026-06-05 19:30" or "2026-06-05T19:30:00Z")
//   B: Home Team        (canonical name, must match wc_featured_teams.canonical_name for at least one side)
//   C: Away Team        (canonical name)
//   D: Venue            (optional)
//   E: Status           (optional, default "SCHEDULED")
//   Row 1 is treated as the header and skipped.
//
// Identity / dedup:
//   wc_matches has UNIQUE(football_data_id). For manual rows we synthesize a
//   stable negative integer from a SHA-1 hash of (date|home|away). This
//   guarantees idempotent upserts and zero collision with real
//   football-data.org IDs (which are positive).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronOrAdmin } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHEET_TAB = 'WC Friendlies';

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

// ---------------------------------------------------------------------------
// Google service-account JWT helper (mirrors google-sheets-sync)
// ---------------------------------------------------------------------------
async function getGoogleAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const encode = (obj: any) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsignedToken}.${signature}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed: ${await tokenResponse.text()}`);
  }
  const tokenData = await tokenResponse.json();
  return tokenData.access_token as string;
}

// Deterministic negative int32 ID from SHA-1(date|home|away)
async function syntheticFootballDataId(date: string, home: string, away: string): Promise<number> {
  const buf = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(`${date}|${home.toLowerCase()}|${away.toLowerCase()}`),
  );
  const bytes = new Uint8Array(buf);
  // Take first 4 bytes as unsigned int, then negate to keep range out of real IDs
  const u32 = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return -1 * (u32 % 2_000_000_000) - 1; // range: -2_000_000_000 .. -1
}

function parseKickoff(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Accept "2026-06-05 19:30", "2026-06-05T19:30", "2026-06-05T19:30:00Z"
  const normalized = /T|Z|\+/.test(s) ? s : s.replace(' ', 'T') + ':00Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    // Prefer dedicated friendlies sheet; fall back to the main sheet for back-compat.
    const sheetId =
      Deno.env.get('GOOGLE_WC_FRIENDLIES_SHEET_ID') ?? Deno.env.get('GOOGLE_SHEET_ID');
    if (!serviceAccountJson) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!sheetId) throw new Error('Missing GOOGLE_WC_FRIENDLIES_SHEET_ID (or GOOGLE_SHEET_ID)');

    // Surface service account email so admins know which address to share the sheet with.
    try {
      const sa = JSON.parse(serviceAccountJson);
      console.log(`[sync-worldcup-friendlies] service account: ${sa.client_email}`);
    } catch { /* ignore */ }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const authHeaders = { Authorization: `Bearer ${accessToken}` };

    // Load featured teams (for one-side-must-be-featured guard)
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('canonical_name, iso_code, priority_flag, enabled')
      .eq('enabled', true);
    const featuredByCanonical = new Map(
      (featuredTeams ?? []).map((t) => [t.canonical_name.toLowerCase(), t]),
    );

    // Read the tab — A:E
    const range = `${SHEET_TAB}!A:E`;
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: authHeaders },
    );
    if (!sheetRes.ok) {
      const txt = await sheetRes.text();
      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'sync-worldcup-friendlies',
        log_level: 'error',
        message: `Sheet read failed: ${sheetRes.status}`,
        context: { status: sheetRes.status, body: txt.slice(0, 500), tab: SHEET_TAB },
      });
      throw new Error(`Sheet read returned ${sheetRes.status} — does tab "${SHEET_TAB}" exist?`);
    }
    const sheetJson = await sheetRes.json();
    const rows: string[][] = sheetJson.values ?? [];
    const dataRows = rows.slice(1); // skip header

    let upserted = 0;
    let skippedNoFeatured = 0;
    let skippedBadDate = 0;
    let skippedInPast = 0;
    let errors = 0;
    const now = Date.now();

    for (const r of dataRows) {
      const [rawDate, rawHome, rawAway, rawVenue, rawStatus] = r;
      if (!rawDate || !rawHome || !rawAway) continue;

      const kickoffIso = parseKickoff(rawDate);
      if (!kickoffIso) { skippedBadDate++; continue; }
      if (new Date(kickoffIso).getTime() < now - 24 * 60 * 60 * 1000) { skippedInPast++; continue; }

      const home = rawHome.trim();
      const away = rawAway.trim();
      const homeFeatured = featuredByCanonical.get(home.toLowerCase());
      const awayFeatured = featuredByCanonical.get(away.toLowerCase());
      if (!homeFeatured && !awayFeatured) { skippedNoFeatured++; continue; }

      const fdId = await syntheticFootballDataId(kickoffIso, home, away);
      const venue = rawVenue?.trim() || null;

      const row: Record<string, unknown> = {
        football_data_id: fdId,
        competition_code: 'FRIENDLY',
        home_team_canonical: home,
        away_team_canonical: away,
        home_team_iso: homeFeatured?.iso_code ?? null,
        away_team_iso: awayFeatured?.iso_code ?? null,
        kickoff_utc: kickoffIso,
        venue,
        venue_timezone: inferVenueTimezone(venue),
        stage: 'FRIENDLY',
        group_letter: null,
        priority_flag:
          homeFeatured?.iso_code === 'IRQ' || awayFeatured?.iso_code === 'IRQ' ? 'host_team' : null,
        featured_match: true,
        status: (rawStatus?.trim() || 'SCHEDULED').toUpperCase(),
        raw_api_payload: { source: 'google_sheet', tab: SHEET_TAB, raw: r },
        last_synced_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await supabase
        .from('wc_matches')
        .upsert(row, { onConflict: 'football_data_id', ignoreDuplicates: false });
      if (upsertErr) {
        errors++;
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'sync-worldcup-friendlies',
          log_level: 'error',
          message: `Upsert failed for friendly ${home} v ${away}`,
          context: { error: upsertErr.message, kickoff: kickoffIso },
        });
      } else {
        upserted++;
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'sync-worldcup-friendlies',
      log_level: 'info',
      message: `Friendlies sheet sync complete: ${upserted} upserted`,
      context: {
        tab: SHEET_TAB,
        rows_read: dataRows.length,
        upserted,
        skipped_no_featured: skippedNoFeatured,
        skipped_bad_date: skippedBadDate,
        skipped_in_past: skippedInPast,
        errors,
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
        tab: SHEET_TAB,
        rows_read: dataRows.length,
        upserted,
        skipped_no_featured: skippedNoFeatured,
        skipped_bad_date: skippedBadDate,
        skipped_in_past: skippedInPast,
        errors,
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
