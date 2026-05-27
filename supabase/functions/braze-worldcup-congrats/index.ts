// ============================================================================
// braze-worldcup-congrats
// ----------------------------------------------------------------------------
// Post-match congrats push for FIFA World Cup 2026 — mirrors the league
// `braze-congrats` pipeline but in the WC namespace:
//   - Picks up wc_matches with status='FINISHED' + congrats_status='pending'
//   - Skips draws and matches whose winner isn't a featured WC team
//   - Targets fans of the winning team via the WC Team 1..4 custom attributes
//   - Inserts into wc_congrats_ledger (UNIQUE match_id) to prevent duplicates
//   - Fires a Braze Campaign trigger (broadcast: true) with full trigger props
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_TIMEOUT_MINUTES = 10;
const SCHEDULER_LOCK_KEY   = 41005;
const MAX_MATCHES_PER_RUN  = 50;
// Only send congrats for matches finished within this window (hours since kickoff)
const MAX_MATCH_AGE_HOURS  = 12;

const WC_TEAM_ATTRIBUTES = ['WC Team 1', 'WC Team 2', 'WC Team 3', 'WC Team 4'];
const HOLDOUT_ATTRIBUTE  = 'wc_holdout_flag';

const COMPETITION_EN = 'FIFA World Cup 2026';
const COMPETITION_AR = 'كأس العالم 2026';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const lockId = crypto.randomUUID();
  let lockAcquired = false;

  try {
    // ---------- advisory lock ----------
    const { data: granted, error: lockErr } = await supabase.rpc('pg_try_advisory_lock', { key: SCHEDULER_LOCK_KEY });
    if (lockErr) throw new Error(`advisory lock failed: ${lockErr.message}`);
    if (!granted) {
      return new Response(
        JSON.stringify({ message: 'Already running', processed: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    lockAcquired = true;

    await supabase.from('wc_scheduler_locks').update({
      locked_at: new Date().toISOString(),
      locked_by: lockId,
      expires_at: new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString(),
    }).eq('lock_name', 'braze-worldcup-congrats');

    // ---------- flags ----------
    const { data: flagRows } = await supabase.from('wc_feature_flags').select('key, enabled');
    const flags = new Map(flagRows?.map(f => [f.key, f]) ?? []);
    const flag = (k: string) => flags.get(k)?.enabled === true;

    if (!flag('wc_congrats_notifications_enabled')) {
      return new Response(
        JSON.stringify({ message: 'Feature disabled', processed: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const dryRun         = flag('dry_run_mode');
    const holdoutEnabled = flag('holdout_enabled');

    // ---------- env / Braze ----------
    const brazeApiKey   = Deno.env.get('BRAZE_REST_API_KEY') ?? Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_WC_CONGRATS_CAMPAIGN_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'braze-worldcup-congrats',
        log_level: 'error',
        message: 'Missing Braze congrats configuration',
        context: {
          has_api_key: !!brazeApiKey,
          has_endpoint: !!brazeEndpoint,
          has_campaign_id: !!brazeCampaignId,
        },
      });
      throw new Error('Missing Braze WC congrats configuration (BRAZE_API_KEY, BRAZE_REST_ENDPOINT, or BRAZE_WC_CONGRATS_CAMPAIGN_ID)');
    }

    // ---------- featured teams ----------
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('canonical_name, iso_code, display_name_en, display_name_ar, braze_attribute_value, enabled');
    const featuredByCanonical = new Map(
      featuredTeams?.filter(t => t.enabled).map(t => [t.canonical_name, t]) ?? []
    );

    // ---------- translations cache ----------
    const { data: existingTrans } = await supabase
      .from('team_translations')
      .select('team_name, arabic_name');
    const teamArabicMap = new Map<string, string>(
      existingTrans?.map(t => [t.team_name, t.arabic_name]) ?? []
    );
    for (const t of featuredTeams ?? []) {
      if (t.display_name_ar) teamArabicMap.set(t.canonical_name, t.display_name_ar);
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    async function ensureTeamTranslation(teamName: string): Promise<string | null> {
      if (teamArabicMap.has(teamName)) return teamArabicMap.get(teamName)!;
      if (!lovableApiKey) return null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          signal: ctrl.signal,
          method: 'POST',
          headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'You are a sports translator specializing in football team names. Translate the given football team name to Arabic. Return ONLY the Arabic translation, nothing else. Use the commonly recognized Arabic name for the team.' },
              { role: 'user', content: `Translate this football team name to Arabic: ${teamName}` },
            ],
          }),
        });
        clearTimeout(t);
        if (!res.ok) return null;
        const j = await res.json();
        const ar = j.choices?.[0]?.message?.content?.trim();
        if (!ar) return null;
        const { error: insErr } = await supabase
          .from('team_translations')
          .insert({ team_name: teamName, arabic_name: ar });
        if (insErr && insErr.code !== '23505') console.error(`save translation ${teamName}:`, insErr);
        teamArabicMap.set(teamName, ar);
        return ar;
      } catch (e) {
        console.error(`translate ${teamName} failed:`, e);
        return null;
      }
    }

    // ---------- fetch pending finished matches ----------
    const ageCutoff = new Date(Date.now() - MAX_MATCH_AGE_HOURS * 60 * 60 * 1000).toISOString();
    const { data: pendingMatches, error: matchErr } = await supabase
      .from('wc_matches')
      .select('*')
      .eq('status', 'FINISHED')
      .eq('congrats_status', 'pending')
      .not('score_home', 'is', null)
      .not('score_away', 'is', null)
      .gte('kickoff_utc', ageCutoff)
      .order('kickoff_utc', { ascending: false })
      .limit(MAX_MATCHES_PER_RUN);
    if (matchErr) throw matchErr;

    if (!pendingMatches || pendingMatches.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending matches', processed: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let sent = 0, skipped = 0, errors = 0, dryRunCount = 0;

    for (const match of pendingMatches) {
      try {
        const scoreHome = match.score_home as number;
        const scoreAway = match.score_away as number;

        // skip draws
        if (scoreHome === scoreAway) {
          await supabase.from('wc_matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-congrats',
            log_level: 'info',
            match_id: match.id,
            message: `skipped_draw`,
            context: { score: `${scoreHome}-${scoreAway}` },
          });
          skipped++;
          continue;
        }

        const winnerIsHome = scoreHome > scoreAway;
        const winningCanonical = winnerIsHome ? match.home_team_canonical : match.away_team_canonical;
        const losingCanonical  = winnerIsHome ? match.away_team_canonical : match.home_team_canonical;
        const winningFeatured  = featuredByCanonical.get(winningCanonical);

        if (!winningFeatured) {
          await supabase.from('wc_matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-congrats',
            log_level: 'info',
            match_id: match.id,
            message: 'skipped_winner_not_featured',
            context: { winning_team: winningCanonical },
          });
          skipped++;
          continue;
        }

        // translations
        const homeAr = await ensureTeamTranslation(match.home_team_canonical);
        const awayAr = await ensureTeamTranslation(match.away_team_canonical);
        if (!homeAr || !awayAr) {
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-congrats',
            log_level: 'warn',
            match_id: match.id,
            message: 'skipped_missing_arabic',
            context: { home: match.home_team_canonical, away: match.away_team_canonical },
          });
          skipped++;
          continue;
        }
        const winningAr = winnerIsHome ? homeAr : awayAr;
        const losingAr  = winnerIsHome ? awayAr : homeAr;

        // reserve slot in ledger (UNIQUE on match_id is the dedup gate)
        const { error: ledgerError } = await supabase.from('wc_congrats_ledger').insert({
          match_id: match.id,
          winning_team_canonical: winningCanonical,
          losing_team_canonical:  losingCanonical,
          score_home: scoreHome,
          score_away: scoreAway,
          status: 'sent',
        });
        if (ledgerError) {
          if (ledgerError.code === '23505') {
            // already processed — flip matches row to 'sent' and move on
            await supabase.from('wc_matches').update({ congrats_status: 'sent' }).eq('id', match.id);
            skipped++;
            continue;
          }
          throw ledgerError;
        }

        const winningBrazeValue = winningFeatured.braze_attribute_value ?? winningCanonical;

        // audience: any WC slot equals the winning team's braze value
        const teamClause = {
          OR: WC_TEAM_ATTRIBUTES.map(attr => ({
            custom_attribute: { custom_attribute_name: attr, comparison: 'equals', value: winningBrazeValue },
          })),
        };
        const audience = holdoutEnabled
          ? { AND: [teamClause, { custom_attribute: { custom_attribute_name: HOLDOUT_ATTRIBUTE, comparison: 'does_not_equal', value: true } }] }
          : teamClause;

        const brazePayload = {
          campaign_id: brazeCampaignId,
          broadcast: true,
          audience,
          trigger_properties: {
            tournament:        'WC2026',
            match_id:          match.id,
            competition_key:   'WC',
            competition_en:    COMPETITION_EN,
            competition_ar:    COMPETITION_AR,
            winning_team_en:   winningFeatured.display_name_en ?? winningCanonical,
            winning_team_ar:   winningAr,
            losing_team_en:    featuredByCanonical.get(losingCanonical)?.display_name_en ?? losingCanonical,
            losing_team_ar:    losingAr,
            home_en:           match.home_team_canonical,
            away_en:           match.away_team_canonical,
            home_ar:           homeAr,
            away_ar:           awayAr,
            score_home:        scoreHome,
            score_away:        scoreAway,
            result_summary:    `${scoreHome}-${scoreAway}`,
            stage:             match.stage,
            group_letter:      match.group_letter,
            venue:             match.venue,
            kickoff_utc:       match.kickoff_utc,
          },
        };

        if (dryRun) {
          await supabase.from('wc_congrats_ledger').update({ status: 'dry_run' }).eq('match_id', match.id);
          await supabase.from('wc_matches').update({ congrats_status: 'sent' }).eq('id', match.id);
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-congrats',
            log_level: 'info',
            match_id: match.id,
            message: 'dry_run_congrats',
            context: { winning_team: winningCanonical, score: `${scoreHome}-${scoreAway}`, payload: brazePayload },
          });
          dryRunCount++;
          continue;
        }

        const brazeRes = await fetch(`${brazeEndpoint}/campaigns/trigger/send`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${brazeApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(brazePayload),
        });
        const brazeResult = await brazeRes.json().catch(() => ({}));

        if (!brazeRes.ok) {
          await supabase.from('wc_congrats_ledger').update({
            status: 'error',
            error_message: typeof brazeResult === 'object' ? JSON.stringify(brazeResult).slice(0, 500) : String(brazeResult),
          }).eq('match_id', match.id);
          await supabase.from('wc_matches').update({ congrats_status: 'error' }).eq('id', match.id);
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-congrats',
            log_level: 'error',
            match_id: match.id,
            message: `braze_api_error_${brazeRes.status}`,
            context: { braze_response: brazeResult },
          });
          errors++;
          continue;
        }

        const dispatchId = brazeResult.dispatch_id ?? null;
        await supabase.from('wc_congrats_ledger').update({ braze_dispatch_id: dispatchId }).eq('match_id', match.id);
        await supabase.from('wc_matches').update({ congrats_status: 'sent' }).eq('id', match.id);
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-congrats',
          log_level: 'info',
          match_id: match.id,
          message: 'congrats_sent',
          context: {
            winning_team: winningCanonical,
            losing_team: losingCanonical,
            score: `${scoreHome}-${scoreAway}`,
            dispatch_id: dispatchId,
            braze_attribute_value: winningBrazeValue,
          },
        });
        sent++;
      } catch (e) {
        console.error(`congrats error for match ${match.id}:`, e);
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-congrats',
          log_level: 'error',
          match_id: match.id,
          message: 'match_processing_error',
          context: { error: e instanceof Error ? e.message : 'unknown' },
        });
        errors++;
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-congrats',
      log_level: 'info',
      message: 'Run complete',
      context: { processed: pendingMatches.length, sent, skipped, errors, dry_run: dryRunCount, dry_run_mode: dryRun },
    });

    return new Response(
      JSON.stringify({ success: true, processed: pendingMatches.length, sent, skipped, errors, dry_run: dryRunCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('braze-worldcup-congrats error:', error);
    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-congrats',
      log_level: 'error',
      message: 'Top-level exception',
      context: { error: error instanceof Error ? error.message : 'unknown' },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'unknown', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } finally {
    if (lockAcquired) {
      await Promise.allSettled([
        supabase.from('wc_scheduler_locks').update({ locked_at: null, locked_by: null, expires_at: null })
          .eq('lock_name', 'braze-worldcup-congrats').eq('locked_by', lockId),
        supabase.rpc('pg_advisory_unlock', { key: SCHEDULER_LOCK_KEY }),
      ]);
    }
  }
});
