// ============================================================================
// braze-worldcup-scheduler
// ----------------------------------------------------------------------------
// FIFA World Cup 2026 reminder scheduler. Two-phase logic:
//
//   Phase 1: For every featured WC match in the next 30 days, INSERT one
//            wc_schedule_ledger row per featured team playing (e.g. Brazil v
//            Argentina = two ledger rows). Deduped by SHA-256 signature.
//
//   Phase 2: For every queued ledger row whose send time falls within the
//            next 20 minutes, call Braze Canvas trigger/schedule/create with
//            audience targeting WC Team 1/2/3 = target_team_canonical.
//
// Mirrors the safety pattern of braze-scheduler (advisory lock, feature flag,
// per-step logging, attempt-count retry) but is fully isolated — different
// tables, different lock keys, different feature flag namespace.
//
// IMPORTANT: This function lives in PARALLEL with the existing club football
// braze-scheduler. It does not read or write any of those tables.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEND_OFFSET_MINUTES   = 60;   // T-60m before kickoff
const FIRE_WINDOW_MINUTES   = 20;   // Send rows whose send time is within 20 min
const QUEUE_LOOKAHEAD_DAYS  = 30;   // Queue rows for matches up to 30 days out
const MAX_ATTEMPTS          = 3;
const LOCK_TIMEOUT_MINUTES  = 10;
const SCHEDULER_LOCK_KEY    = 41003;

// Braze custom attribute names that the IAM writes for WC team picks.
// Exact strings (case + spaces matter) — verify in Braze before launch.
const WC_TEAM_ATTRIBUTES = ['WC Team 1', 'WC Team 2', 'WC Team 3'];

// Holdout exclusion attribute (server-side defense in depth)
const HOLDOUT_ATTRIBUTE = 'wc_holdout_flag';

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function toArabicDigits(str: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/\d/g, d => arabicDigits[parseInt(d)]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const lockId = crypto.randomUUID();
  let lockAcquired = false;

  try {
    // ------------------------------------------------------------------
    // Acquire advisory lock (prevents concurrent scheduler runs)
    // ------------------------------------------------------------------
    const { data: granted, error: lockErr } = await supabase.rpc('pg_try_advisory_lock', {
      key: SCHEDULER_LOCK_KEY,
    });
    if (lockErr) throw new Error(`Failed to acquire advisory lock: ${lockErr.message}`);
    if (!granted) {
      console.log('Another WC scheduler run is already in progress — exiting');
      return new Response(
        JSON.stringify({ message: 'Already running', queued: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    lockAcquired = true;

    const lockExpiry = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    await supabase
      .from('wc_scheduler_locks')
      .update({ locked_at: new Date().toISOString(), locked_by: lockId, expires_at: lockExpiry })
      .eq('lock_name', 'braze-worldcup-scheduler');

    // ------------------------------------------------------------------
    // Read feature flags
    // ------------------------------------------------------------------
    const { data: flagRows } = await supabase
      .from('wc_feature_flags')
      .select('key, enabled, value');

    const flags = new Map(flagRows?.map(f => [f.key, f]) ?? []);
    const flag = (k: string) => flags.get(k)?.enabled === true;
    const flagValue = (k: string) => flags.get(k)?.value ?? null;

    if (!flag('scheduler_enabled')) {
      console.log('scheduler_enabled = false — exiting');
      return new Response(
        JSON.stringify({ message: 'Scheduler disabled', queued: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dryRun           = flag('dry_run_mode');
    const iraqSafetyNet    = flag('iraq_safety_net_enabled');
    const iraqEliminated   = flag('iraq_eliminated');
    const holdoutEnabled   = flag('holdout_enabled');

    // ------------------------------------------------------------------
    // Env vars
    // ------------------------------------------------------------------
    const brazeApiKey   = Deno.env.get('BRAZE_REST_API_KEY') ?? Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration: BRAZE_REST_API_KEY / BRAZE_REST_ENDPOINT / BRAZE_WC_CANVAS_ID');
    }

    // ------------------------------------------------------------------
    // Load featured teams (for canonical → display name lookups)
    // ------------------------------------------------------------------
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('canonical_name, iso_code, display_name_en, display_name_ar, braze_attribute_value, priority_flag, enabled');

    const featuredByCanonical = new Map(
      featuredTeams?.filter(t => t.enabled).map(t => [t.canonical_name, t]) ?? []
    );

    let queued = 0;
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let dryRunCount = 0;

    // ============================================================================
    // PHASE 1 — Queue new ledger rows for upcoming featured WC matches
    // ============================================================================
    const now = new Date();
    const horizon = new Date(now.getTime() + QUEUE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

    const { data: upcomingMatches, error: matchErr } = await supabase
      .from('wc_matches')
      .select('*')
      .eq('featured_match', true)
      .gte('kickoff_utc', now.toISOString())
      .lte('kickoff_utc', horizon.toISOString())
      .in('status', ['SCHEDULED', 'TIMED'])
      .order('kickoff_utc', { ascending: true });

    if (matchErr) throw matchErr;

    console.log(`Phase 1: examining ${upcomingMatches?.length ?? 0} upcoming featured WC matches`);

    for (const match of upcomingMatches ?? []) {
      // Identify which featured teams are playing
      const targets: string[] = [];

      const homeFeatured = featuredByCanonical.get(match.home_team_canonical);
      const awayFeatured = featuredByCanonical.get(match.away_team_canonical);

      if (homeFeatured) targets.push(homeFeatured.canonical_name);
      if (awayFeatured) targets.push(awayFeatured.canonical_name);

      // Iraq safety net: even if Iraq isn't picked up via the featured map
      // (shouldn't happen, but defensive), force-add Iraq when iraq_safety_net is on
      if (iraqSafetyNet && !iraqEliminated) {
        if (match.home_team_iso === 'IRQ' && !targets.includes('Iraq')) targets.push('Iraq');
        if (match.away_team_iso === 'IRQ' && !targets.includes('Iraq')) targets.push('Iraq');
      }

      // Iraq elimination switch: stop creating Iraq ledger rows
      if (iraqEliminated) {
        const filtered = targets.filter(t => t !== 'Iraq');
        if (filtered.length === 0 && targets.length > 0) {
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-scheduler',
            log_level: 'info',
            match_id: match.id,
            message: `Skipping Iraq-only match ${match.id} — iraq_eliminated flag is on`,
            context: { match_id: match.id, home: match.home_team_canonical, away: match.away_team_canonical },
          });
        }
        targets.length = 0;
        targets.push(...filtered);
      }

      if (targets.length === 0) continue;

      const sendAt = new Date(new Date(match.kickoff_utc).getTime() - SEND_OFFSET_MINUTES * 60 * 1000);

      // Skip matches whose send window has already passed
      if (sendAt <= now) {
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'info',
          match_id: match.id,
          message: 'Send window already passed',
          context: { kickoff_utc: match.kickoff_utc, send_at: sendAt.toISOString(), now: now.toISOString() },
        });
        continue;
      }

      for (const targetTeam of targets) {
        const signature = await sha256(`${match.id}|${targetTeam}|${brazeCanvasId}`);

        // Insert ON CONFLICT DO NOTHING — signature unique constraint dedups
        const { error: insertErr } = await supabase
          .from('wc_schedule_ledger')
          .insert({
            match_id: match.id,
            braze_canvas_id: brazeCanvasId,
            target_team_canonical: targetTeam,
            scheduled_send_at_utc: sendAt.toISOString(),
            status: 'queued',
            signature,
            attempt_count: 0,
            dry_run: dryRun,
          });

        if (insertErr) {
          // 23505 = unique violation = signature already exists = already queued
          if (insertErr.code !== '23505') {
            console.error(`Failed to queue ledger row (match ${match.id}, team ${targetTeam}):`, insertErr);
            await supabase.from('wc_scheduler_logs').insert({
              function_name: 'braze-worldcup-scheduler',
              log_level: 'error',
              match_id: match.id,
              message: 'Failed to insert ledger row',
              context: { error: insertErr.message, target_team: targetTeam },
            });
          }
          continue;
        }

        queued++;
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'info',
          match_id: match.id,
          message: `Queued ledger row for ${targetTeam}`,
          context: { match_id: match.id, target_team: targetTeam, send_at: sendAt.toISOString(), dry_run: dryRun },
        });
      }
    }

    // ============================================================================
    // PHASE 2 — Fire queued rows whose send time is within FIRE_WINDOW_MINUTES
    // ============================================================================
    const fireBy = new Date(now.getTime() + FIRE_WINDOW_MINUTES * 60 * 1000);

    const { data: dueRows, error: dueErr } = await supabase
      .from('wc_schedule_ledger')
      .select(`
        id, match_id, target_team_canonical, scheduled_send_at_utc, signature,
        attempt_count, braze_canvas_id, dry_run,
        wc_matches:match_id (
          id, football_data_id, home_team_canonical, away_team_canonical,
          home_team_iso, away_team_iso, kickoff_utc, venue, venue_timezone,
          stage, group_letter, priority_flag
        )
      `)
      .eq('status', 'queued')
      .lte('scheduled_send_at_utc', fireBy.toISOString())
      .lt('attempt_count', MAX_ATTEMPTS)
      .order('scheduled_send_at_utc', { ascending: true });

    if (dueErr) throw dueErr;

    console.log(`Phase 2: ${dueRows?.length ?? 0} ledger rows due to fire`);

    for (const row of (dueRows ?? []) as any[]) {
      const match = row.wc_matches;
      if (!match) {
        await supabase
          .from('wc_schedule_ledger')
          .update({ status: 'failed', error_message: 'Parent match missing', updated_at: new Date().toISOString() })
          .eq('id', row.id);
        failed++;
        continue;
      }

      const target = featuredByCanonical.get(row.target_team_canonical);
      const opponent =
        match.home_team_canonical === row.target_team_canonical
          ? match.away_team_canonical
          : match.home_team_canonical;
      const opponentFeatured = featuredByCanonical.get(opponent);

      // Localization safety: skip if Arabic name missing for either side
      if (!target?.display_name_ar || !opponentFeatured?.display_name_ar) {
        // For non-featured opponents (TBD or non-12 nations), use English as opponent_ar fallback
        // but we MUST have target_team_ar
        if (!target?.display_name_ar) {
          await supabase
            .from('wc_schedule_ledger')
            .update({
              status: 'failed',
              error_message: 'Missing Arabic translation for target team',
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-scheduler',
            log_level: 'error',
            match_id: match.id,
            message: 'Skipped send — target_team_ar missing',
            context: { target_team: row.target_team_canonical, opponent },
          });
          failed++;
          continue;
        }
      }

      const kickoffUtc = new Date(match.kickoff_utc);
      const baghdadOffsetMs = 3 * 60 * 60 * 1000; // UTC+3
      const baghdadIso = new Date(kickoffUtc.getTime() + baghdadOffsetMs).toISOString().replace('Z', '+03:00');

      const isIraqMatch = match.home_team_iso === 'IRQ' || match.away_team_iso === 'IRQ';
      const isKnockout = match.stage && match.stage !== 'GROUP_STAGE';

      const canvasEntryProperties: Record<string, unknown> = {
        tournament:           'WC2026',
        match_id:             match.id,
        target_team_en:       target?.display_name_en ?? row.target_team_canonical,
        target_team_ar:       target?.display_name_ar ?? row.target_team_canonical,
        opponent_en:          opponentFeatured?.display_name_en ?? opponent,
        opponent_ar:          opponentFeatured?.display_name_ar ?? opponent,
        kickoff_utc_iso:      match.kickoff_utc,
        kickoff_baghdad_iso:  baghdadIso,
        kickoff_baghdad_human: toArabicDigits(
          new Date(kickoffUtc.getTime() + baghdadOffsetMs)
            .toISOString()
            .replace('T', ' ')
            .replace(/:\d{2}\.\d{3}Z$/, '')
        ),
        stage:                match.stage,
        group_letter:         match.group_letter,
        venue:                match.venue,
        venue_timezone:       match.venue_timezone,
        priority_flag:        match.priority_flag,
        is_iraq_match:        isIraqMatch,
        is_knockout:          !!isKnockout,
      };

      // Audience: target_team in any of WC Team 1/2/3, AND not in holdout
      const teamMatch = {
        OR: WC_TEAM_ATTRIBUTES.map(attr => ({
          custom_attribute: {
            custom_attribute_name: attr,
            comparison: 'equals',
            value: target?.braze_attribute_value ?? row.target_team_canonical,
          },
        })),
      };

      const audience = holdoutEnabled
        ? {
            AND: [
              teamMatch,
              {
                custom_attribute: {
                  custom_attribute_name: HOLDOUT_ATTRIBUTE,
                  comparison: 'does_not_equal',
                  value: true,
                },
              },
            ],
          }
        : teamMatch;

      // ----------------------------------------------------------------
      // DRY RUN — write log + bump status, skip Braze API call
      // ----------------------------------------------------------------
      if (row.dry_run || dryRun) {
        await supabase
          .from('wc_schedule_ledger')
          .update({
            status: 'sent_to_braze',
            braze_send_id: `dry-run-${crypto.randomUUID()}`,
            attempt_count: row.attempt_count + 1,
            updated_at: new Date().toISOString(),
            dry_run: true,
          })
          .eq('id', row.id);

        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'info',
          match_id: match.id,
          message: 'DRY RUN — would have called Braze Canvas trigger',
          context: { ledger_id: row.id, target_team: row.target_team_canonical, audience, canvasEntryProperties },
        });
        dryRunCount++;
        continue;
      }

      // ----------------------------------------------------------------
      // LIVE — call Braze Canvas trigger
      // ----------------------------------------------------------------
      try {
        const brazeRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${brazeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            canvas_id: row.braze_canvas_id,
            broadcast: true,
            schedule: { time: row.scheduled_send_at_utc },
            audience,
            canvas_entry_properties: canvasEntryProperties,
          }),
        });

        if (!brazeRes.ok) {
          const errText = await brazeRes.text();
          await supabase
            .from('wc_schedule_ledger')
            .update({
              status: row.attempt_count + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued',
              error_message: `Braze API ${brazeRes.status}: ${errText}`,
              attempt_count: row.attempt_count + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);

          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-scheduler',
            log_level: 'error',
            match_id: match.id,
            message: `Braze API call failed (status ${brazeRes.status})`,
            context: { ledger_id: row.id, status: brazeRes.status, error: errText, attempt: row.attempt_count + 1 },
          });
          failed++;
          continue;
        }

        const brazeData = await brazeRes.json();

        await supabase
          .from('wc_schedule_ledger')
          .update({
            status: 'sent_to_braze',
            braze_send_id: brazeData.schedule_id ?? brazeData.send_id ?? null,
            attempt_count: row.attempt_count + 1,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'info',
          match_id: match.id,
          message: `Scheduled Braze Canvas send for ${row.target_team_canonical}`,
          context: {
            ledger_id: row.id,
            target_team: row.target_team_canonical,
            opponent,
            schedule_id: brazeData.schedule_id,
            scheduled_for: row.scheduled_send_at_utc,
          },
        });
        sent++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        await supabase
          .from('wc_schedule_ledger')
          .update({
            status: row.attempt_count + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued',
            error_message: errMsg,
            attempt_count: row.attempt_count + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'error',
          match_id: match.id,
          message: 'Exception calling Braze',
          context: { ledger_id: row.id, error: errMsg, attempt: row.attempt_count + 1 },
        });
        failed++;
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-scheduler',
      log_level: 'info',
      message: 'Run complete',
      context: { queued, sent, failed, dry_run: dryRunCount, skipped, dry_run_mode: dryRun },
    });

    return new Response(
      JSON.stringify({ queued, sent, failed, dry_run: dryRunCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('braze-worldcup-scheduler error:', error);
    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-scheduler',
      log_level: 'error',
      message: 'Top-level exception',
      context: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (lockAcquired) {
      await Promise.allSettled([
        supabase
          .from('wc_scheduler_locks')
          .update({ locked_at: null, locked_by: null, expires_at: null })
          .eq('lock_name', 'braze-worldcup-scheduler')
          .eq('locked_by', lockId),
        supabase.rpc('pg_advisory_unlock', { key: SCHEDULER_LOCK_KEY }),
      ]);
    }
  }
});
