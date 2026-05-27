// ============================================================================
// braze-worldcup-scheduler  (PARITY-WITH-LEAGUE)
// ----------------------------------------------------------------------------
// FIFA WC 2026 reminder scheduler — mirrors the league `braze-scheduler`
// safety contract:
//   - advisory lock + lock table
//   - feature flag check
//   - pre-flight against wc_notification_sends (already-delivered guard)
//   - pre-flight against wc_schedule_ledger (existing-row guard)
//   - update path with 20-min update buffer when content/timing changes
//   - signature-driven dedup including kickoff + Arabic strings
//   - rich canvas_entry_properties with kickoff_baghdad, kickoff_ar, sig
//   - auto-translate non-featured opponents via Lovable AI Gateway,
//     persisted in shared `team_translations` table
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { formatInTimeZone, toZonedTime } from 'npm:date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEND_OFFSET_MINUTES   = 60;
const FIRE_WINDOW_MINUTES   = 20;
const UPDATE_BUFFER_MINUTES = 20;
const QUEUE_LOOKAHEAD_DAYS  = 45;
const MAX_ATTEMPTS          = 3;
const LOCK_TIMEOUT_MINUTES  = 10;
const SCHEDULER_LOCK_KEY    = 41003;
const BAGHDAD_TIMEZONE      = 'Asia/Baghdad';

const WC_TEAM_ATTRIBUTES = ['WC Team 1', 'WC Team 2', 'WC Team 3', 'WC Team 4'];
const HOLDOUT_ATTRIBUTE  = 'wc_holdout_flag';

const COMPETITION_EN = 'FIFA World Cup 2026';
const COMPETITION_AR = 'كأس العالم 2026';

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function toArabicDigits(str: string): string {
  const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  return str.replace(/\d/g, d => arabicDigits[parseInt(d)]);
}

function buildKickoffAr(kickoffUtc: Date): string {
  const baghdad = toZonedTime(kickoffUtc, BAGHDAD_TIMEZONE);
  const h24 = baghdad.getHours();
  const h12 = h24 % 12 || 12;
  const m   = baghdad.getMinutes();
  const ampm = h24 < 12 ? 'ص' : 'م';
  const day  = baghdad.getDate();
  const mon  = baghdad.getMonth() + 1;
  const yr   = baghdad.getFullYear();
  const timeStr = `${h12}:${m.toString().padStart(2,'0')}`;
  const dateStr = `${day.toString().padStart(2,'0')}-${mon.toString().padStart(2,'0')}-${yr}`;
  return toArabicDigits(`الساعة ${timeStr} ${ampm} ${dateStr} (توقيت بغداد)`);
}

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
        JSON.stringify({ message: 'Already running', queued: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    lockAcquired = true;

    await supabase.from('wc_scheduler_locks').update({
      locked_at: new Date().toISOString(),
      locked_by: lockId,
      expires_at: new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString(),
    }).eq('lock_name', 'braze-worldcup-scheduler');

    // ---------- flags ----------
    const { data: flagRows } = await supabase.from('wc_feature_flags').select('key, enabled, value');
    const flags = new Map(flagRows?.map(f => [f.key, f]) ?? []);
    const flag = (k: string) => flags.get(k)?.enabled === true;

    if (!flag('scheduler_enabled')) {
      return new Response(
        JSON.stringify({ message: 'Scheduler disabled', queued: 0, sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const dryRun         = flag('dry_run_mode');
    const iraqSafetyNet  = flag('iraq_safety_net_enabled');
    const iraqEliminated = flag('iraq_eliminated');
    const holdoutEnabled = flag('holdout_enabled');

    // ---------- env ----------
    const brazeApiKey   = Deno.env.get('BRAZE_REST_API_KEY') ?? Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration');
    }

    // ---------- featured teams ----------
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams')
      .select('canonical_name, iso_code, display_name_en, display_name_ar, braze_attribute_value, priority_flag, enabled');
    const featuredByCanonical = new Map(
      featuredTeams?.filter(t => t.enabled).map(t => [t.canonical_name, t]) ?? []
    );

    // ---------- shared translations cache ----------
    const { data: existingTrans } = await supabase
      .from('team_translations')
      .select('team_name, arabic_name');
    const teamArabicMap = new Map<string, string>(
      existingTrans?.map(t => [t.team_name, t.arabic_name]) ?? []
    );

    // seed from featured display names
    for (const t of featuredTeams ?? []) {
      if (t.display_name_ar) teamArabicMap.set(t.canonical_name, t.display_name_ar);
    }

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
        if (insErr && insErr.code !== '23505') {
          console.error(`save translation ${teamName}:`, insErr);
        } else {
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-scheduler',
            log_level: 'info',
            message: `Auto-translated ${teamName} → ${ar}`,
            context: { team_name: teamName, arabic_name: ar },
          });
        }
        teamArabicMap.set(teamName, ar);
        return ar;
      } catch (e) {
        console.error(`translate ${teamName} failed:`, e);
        return null;
      }
    }

    let queued = 0, sent = 0, updated = 0, skipped = 0, failed = 0, dryRunCount = 0;
    const now = new Date();

    // ============================================================================
    // PHASE 1 — queue ledger rows for upcoming featured WC matches
    // ============================================================================
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

    for (const match of upcomingMatches ?? []) {
      // determine target featured teams
      const targets: string[] = [];
      const homeFeatured = featuredByCanonical.get(match.home_team_canonical);
      const awayFeatured = featuredByCanonical.get(match.away_team_canonical);
      if (homeFeatured) targets.push(homeFeatured.canonical_name);
      if (awayFeatured) targets.push(awayFeatured.canonical_name);

      if (iraqSafetyNet && !iraqEliminated) {
        if (match.home_team_iso === 'IRQ' && !targets.includes('Iraq')) targets.push('Iraq');
        if (match.away_team_iso === 'IRQ' && !targets.includes('Iraq')) targets.push('Iraq');
      }
      if (iraqEliminated) {
        const filtered = targets.filter(t => t !== 'Iraq');
        targets.length = 0;
        targets.push(...filtered);
      }
      if (targets.length === 0) continue;

      const sendAt = new Date(new Date(match.kickoff_utc).getTime() - SEND_OFFSET_MINUTES * 60 * 1000);
      if (sendAt <= now) continue;

      // resolve Arabic translations now (so signature includes them)
      const homeAr = await ensureTeamTranslation(match.home_team_canonical);
      const awayAr = await ensureTeamTranslation(match.away_team_canonical);
      if (!homeAr || !awayAr) {
        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'warn',
          match_id: match.id,
          message: 'Skipped — Arabic translation unavailable for one side',
          context: { home: match.home_team_canonical, away: match.away_team_canonical, homeAr: !!homeAr, awayAr: !!awayAr },
        });
        skipped++;
        continue;
      }

      for (const targetTeam of targets) {
        // ---------- PRE-FLIGHT 1: already-delivered? ----------
        const { data: alreadyDelivered } = await supabase
          .from('wc_notification_sends')
          .select('id, delivered_at')
          .eq('match_id', match.id)
          .in('delivery_status', ['canvas.sent', 'push_sent', 'sent'])
          .limit(1)
          .maybeSingle();
        if (alreadyDelivered) {
          skipped++;
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'braze-worldcup-scheduler',
            log_level: 'info',
            match_id: match.id,
            message: `skipped_already_delivered for ${targetTeam}`,
            context: { delivered_at: alreadyDelivered.delivered_at, target_team: targetTeam },
          });
          continue;
        }

        // build signature including kickoff + arabic + canvas
        const opponentCanonical = match.home_team_canonical === targetTeam
          ? match.away_team_canonical
          : match.home_team_canonical;
        const targetAr   = targetTeam === match.home_team_canonical ? homeAr : awayAr;
        const opponentAr = opponentCanonical === match.home_team_canonical ? homeAr : awayAr;

        const signature = await sha256(
          `${match.id}|${targetTeam}|${brazeCanvasId}|${sendAt.toISOString()}|${targetAr}|${opponentAr}`
        );

        // ---------- PRE-FLIGHT 2: existing active ledger row? ----------
        const { data: existingRow } = await supabase
          .from('wc_schedule_ledger')
          .select('id, signature, status, braze_send_id, scheduled_send_at_utc, attempt_count')
          .eq('match_id', match.id)
          .eq('target_team_canonical', targetTeam)
          .in('status', ['queued', 'sent_to_braze', 'delivered'])
          .maybeSingle();

        if (existingRow) {
          if (existingRow.signature === signature) {
            skipped++;
            continue;
          }
          // signature differs → attempt UPDATE path (only if already sent_to_braze)
          if (existingRow.status === 'sent_to_braze' && existingRow.braze_send_id) {
            const minutesToSend = (sendAt.getTime() - now.getTime()) / 60000;
            if (minutesToSend < UPDATE_BUFFER_MINUTES) {
              skipped++;
              await supabase.from('wc_scheduler_logs').insert({
                function_name: 'braze-worldcup-scheduler',
                log_level: 'info',
                match_id: match.id,
                message: 'skipped_within_buffer',
                context: { minutesToSend, buffer: UPDATE_BUFFER_MINUTES, ledger_id: existingRow.id },
              });
              continue;
            }

            const props = buildEntryProps({ match, targetTeam, opponentCanonical, targetAr, opponentAr, featuredByCanonical, signature });
            const audience = buildAudience(targetTeam, featuredByCanonical, holdoutEnabled, opponentCanonical);

            try {
              const upd = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/update`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${brazeApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  canvas_id: brazeCanvasId,
                  schedule_id: existingRow.braze_send_id,
                  schedule: { time: sendAt.toISOString() },
                  audience,
                  canvas_entry_properties: props,
                }),
              });
              if (!upd.ok) {
                const txt = await upd.text();
                await supabase.from('wc_scheduler_logs').insert({
                  function_name: 'braze-worldcup-scheduler',
                  log_level: 'error',
                  match_id: match.id,
                  message: `Braze schedule/update failed (${upd.status})`,
                  context: { error: txt, ledger_id: existingRow.id },
                });
                continue;
              }
              await supabase.from('wc_schedule_ledger').update({
                signature,
                scheduled_send_at_utc: sendAt.toISOString(),
                updated_at: now.toISOString(),
              }).eq('id', existingRow.id);
              updated++;
            } catch (e) {
              console.error(`update error match ${match.id}:`, e);
            }
            continue;
          }

          // queued row exists with stale signature → just refresh signature/time
          await supabase.from('wc_schedule_ledger').update({
            signature,
            scheduled_send_at_utc: sendAt.toISOString(),
            updated_at: now.toISOString(),
          }).eq('id', existingRow.id);
          continue;
        }

        // ---------- INSERT new ledger row (partial unique idx prevents dupes) ----------
        const { error: insertErr } = await supabase.from('wc_schedule_ledger').insert({
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
          if (insertErr.code !== '23505') {
            console.error(`queue insert match ${match.id} ${targetTeam}:`, insertErr);
          }
          continue;
        }
        queued++;
      }
    }

    // ============================================================================
    // PHASE 2 — fire queued rows whose send time is within FIRE_WINDOW_MINUTES
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

    for (const row of (dueRows ?? []) as any[]) {
      const match = row.wc_matches;
      if (!match) {
        await supabase.from('wc_schedule_ledger').update({
          status: 'failed', error_message: 'parent match missing', updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        failed++;
        continue;
      }

      const opponentCanonical = match.home_team_canonical === row.target_team_canonical
        ? match.away_team_canonical
        : match.home_team_canonical;

      const targetAr   = await ensureTeamTranslation(row.target_team_canonical);
      const opponentAr = await ensureTeamTranslation(opponentCanonical);
      if (!targetAr || !opponentAr) {
        await supabase.from('wc_schedule_ledger').update({
          status: 'failed',
          error_message: 'Missing Arabic translation at fire time',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        failed++;
        continue;
      }

      const props = buildEntryProps({
        match, targetTeam: row.target_team_canonical, opponentCanonical,
        targetAr, opponentAr, featuredByCanonical, signature: row.signature,
      });
      const audience = buildAudience(row.target_team_canonical, featuredByCanonical, holdoutEnabled, opponentCanonical);

      // dry run
      if (row.dry_run || dryRun) {
        await supabase.from('wc_schedule_ledger').update({
          status: 'sent_to_braze',
          braze_send_id: `dry-run-${crypto.randomUUID()}`,
          attempt_count: row.attempt_count + 1,
          updated_at: new Date().toISOString(),
          dry_run: true,
        }).eq('id', row.id);

        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'braze-worldcup-scheduler',
          log_level: 'info',
          match_id: match.id,
          message: 'DRY RUN — would have called Braze Canvas trigger',
          context: { ledger_id: row.id, target_team: row.target_team_canonical, audience, canvas_entry_properties: props },
        });
        dryRunCount++;
        continue;
      }

      try {
        const brazeRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/create`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${brazeApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvas_id: row.braze_canvas_id,
            broadcast: true,
            schedule: { time: row.scheduled_send_at_utc },
            audience,
            canvas_entry_properties: props,
          }),
        });

        if (!brazeRes.ok) {
          const txt = await brazeRes.text();
          await supabase.from('wc_schedule_ledger').update({
            status: row.attempt_count + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued',
            error_message: `Braze ${brazeRes.status}: ${txt}`,
            attempt_count: row.attempt_count + 1,
            updated_at: new Date().toISOString(),
          }).eq('id', row.id);
          failed++;
          continue;
        }

        const data = await brazeRes.json();
        await supabase.from('wc_schedule_ledger').update({
          status: 'sent_to_braze',
          braze_send_id: data.schedule_id ?? data.send_id ?? null,
          attempt_count: row.attempt_count + 1,
          error_message: null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'unknown';
        await supabase.from('wc_schedule_ledger').update({
          status: row.attempt_count + 1 >= MAX_ATTEMPTS ? 'failed' : 'queued',
          error_message: msg,
          attempt_count: row.attempt_count + 1,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
        failed++;
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-scheduler',
      log_level: 'info',
      message: 'Run complete',
      context: { queued, sent, updated, skipped, failed, dry_run: dryRunCount, dry_run_mode: dryRun },
    });

    return new Response(
      JSON.stringify({ queued, sent, updated, skipped, failed, dry_run: dryRunCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('braze-worldcup-scheduler error:', error);
    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-scheduler',
      log_level: 'error',
      message: 'Top-level exception',
      context: { error: error instanceof Error ? error.message : 'unknown' },
    });
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } finally {
    if (lockAcquired) {
      await Promise.allSettled([
        supabase.from('wc_scheduler_locks').update({ locked_at: null, locked_by: null, expires_at: null })
          .eq('lock_name', 'braze-worldcup-scheduler').eq('locked_by', lockId),
        supabase.rpc('pg_advisory_unlock', { key: SCHEDULER_LOCK_KEY }),
      ]);
    }
  }
});

// ----------------------------------------------------------------------------
function buildEntryProps(args: {
  match: any;
  targetTeam: string;
  opponentCanonical: string;
  targetAr: string;
  opponentAr: string;
  featuredByCanonical: Map<string, any>;
  signature: string;
}): Record<string, unknown> {
  const { match, targetTeam, opponentCanonical, targetAr, opponentAr, featuredByCanonical, signature } = args;
  const target = featuredByCanonical.get(targetTeam);
  const opponent = featuredByCanonical.get(opponentCanonical);
  const kickoff = new Date(match.kickoff_utc);
  const isIraqMatch = match.home_team_iso === 'IRQ' || match.away_team_iso === 'IRQ';
  const isKnockout  = match.stage && match.stage !== 'GROUP_STAGE';
  const kickoffBaghdad = formatInTimeZone(kickoff, BAGHDAD_TIMEZONE, 'yyyy-MM-dd HH:mm');

  // home/away naming for league-style template parity
  const homeEn = match.home_team_canonical;
  const awayEn = match.away_team_canonical;
  const homeAr = homeEn === targetTeam ? targetAr : opponentAr;
  const awayAr = awayEn === targetTeam ? targetAr : opponentAr;

  return {
    tournament:           'WC2026',
    match_id:             match.id,
    competition_key:      'WC',
    competition_en:       COMPETITION_EN,
    competition_ar:       COMPETITION_AR,
    home_en:              homeEn,
    away_en:              awayEn,
    home_ar:              homeAr,
    away_ar:              awayAr,
    target_team_en:       target?.display_name_en ?? targetTeam,
    target_team_ar:       targetAr,
    opponent_en:          opponent?.display_name_en ?? opponentCanonical,
    opponent_ar:          opponentAr,
    kickoff_utc:          match.kickoff_utc,
    kickoff_baghdad:      kickoffBaghdad,
    kickoff_ar:           buildKickoffAr(kickoff),
    stage:                match.stage,
    group_letter:         match.group_letter,
    venue:                match.venue,
    venue_timezone:       match.venue_timezone,
    priority_flag:        match.priority_flag,
    is_iraq_match:        isIraqMatch,
    is_knockout:          !!isKnockout,
    sig:                  signature,
  };
}

function buildAudience(
  targetTeam: string,
  featuredByCanonical: Map<string, any>,
  holdoutEnabled: boolean,
  opponentCanonical?: string,
) {
  const featured = featuredByCanonical.get(targetTeam);
  const value = featured?.braze_attribute_value ?? targetTeam;
  const teamMatch = {
    OR: WC_TEAM_ATTRIBUTES.map(attr => ({
      custom_attribute: { custom_attribute_name: attr, comparison: 'equals', value },
    })),
  };

  // Dual-fan dedup: when the opponent is ALSO a featured team, exactly one of
  // the two schedules created for this match must claim users who follow both
  // teams. Deterministic rule: the alphabetically-first canonical name "wins"
  // dual-fans (no exclusion). The other schedule excludes any user whose WC
  // slots contain the winner's value, so dual-fans receive exactly one push.
  const opponentFeatured = opponentCanonical ? featuredByCanonical.get(opponentCanonical) : null;
  const clauses: any[] = [teamMatch];

  if (opponentFeatured && opponentCanonical) {
    const targetWinsDualFans = targetTeam.localeCompare(opponentCanonical) < 0;
    if (!targetWinsDualFans) {
      const opponentValue = opponentFeatured.braze_attribute_value ?? opponentCanonical;
      for (const attr of WC_TEAM_ATTRIBUTES) {
        clauses.push({
          custom_attribute: { custom_attribute_name: attr, comparison: 'does_not_equal', value: opponentValue },
        });
      }
    }
  }

  if (holdoutEnabled) {
    clauses.push({
      custom_attribute: { custom_attribute_name: HOLDOUT_ATTRIBUTE, comparison: 'does_not_equal', value: true },
    });
  }

  return clauses.length === 1 ? teamMatch : { AND: clauses };
}
