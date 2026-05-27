// ============================================================================
// pre-send-verification-worldcup  (PARITY-WITH-LEAGUE)
// ----------------------------------------------------------------------------
// Every 10 minutes: for ledger rows status='sent_to_braze' whose send time is
// within the next 30 minutes, fetch active Braze schedules and re-create any
// schedule that has gone missing in Braze.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireCronOrAdmin } from '../_shared/cron-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRE_SEND_LOCK_KEY  = 41005;
const VERIFY_WINDOW_MIN  = 30;
const LOCK_TIMEOUT_MIN   = 10;
const WC_TEAM_ATTRIBUTES = ['WC Team 1', 'WC Team 2', 'WC Team 3', 'WC Team 4'];
const HOLDOUT_ATTRIBUTE  = 'wc_holdout_flag';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const unauth = await requireCronOrAdmin(req, corsHeaders);
  if (unauth) return unauth;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let lockAcquired = false;
  try {
    const brazeApiKey   = Deno.env.get('BRAZE_REST_API_KEY') ?? Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');
    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) throw new Error('Missing Braze configuration');

    // advisory lock
    const { data: granted } = await supabase.rpc('pg_try_advisory_lock', { key: PRE_SEND_LOCK_KEY });
    if (!granted) {
      return new Response(
        JSON.stringify({ message: 'Already running', checked: 0, verified: 0, recreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    lockAcquired = true;

    // skip if scheduler/reconcile is running
    const { data: locks } = await supabase
      .from('wc_scheduler_locks')
      .select('lock_name, expires_at')
      .in('lock_name', ['braze-worldcup-scheduler', 'braze-worldcup-reconcile']);
    const conflicting = (locks ?? []).find(l => l.expires_at && new Date(l.expires_at) > new Date());
    if (conflicting) {
      return new Response(
        JSON.stringify({ message: `${conflicting.lock_name} running`, checked: 0, verified: 0, recreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date();
    const upper = new Date(now.getTime() + VERIFY_WINDOW_MIN * 60 * 1000);

    const { data: rows, error } = await supabase
      .from('wc_schedule_ledger')
      .select(`
        id, match_id, target_team_canonical, scheduled_send_at_utc, braze_send_id, dry_run, signature, braze_canvas_id,
        wc_matches:match_id (
          id, home_team_canonical, away_team_canonical, home_team_iso, away_team_iso,
          kickoff_utc, venue, venue_timezone, stage, group_letter, priority_flag
        )
      `)
      .eq('status', 'sent_to_braze')
      .gte('scheduled_send_at_utc', now.toISOString())
      .lte('scheduled_send_at_utc', upper.toISOString());
    if (error) throw error;

    if (!rows?.length) {
      return new Response(
        JSON.stringify({ checked: 0, verified: 0, recreated: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // featured teams cache
    const { data: featuredTeams } = await supabase
      .from('wc_featured_teams').select('canonical_name, braze_attribute_value, display_name_en, display_name_ar');
    const featuredByCanonical = new Map(featuredTeams?.map(t => [t.canonical_name, t]) ?? []);

    const { data: flagRows } = await supabase.from('wc_feature_flags').select('key, enabled');
    const holdoutEnabled = flagRows?.find(f => f.key === 'holdout_enabled')?.enabled === true;

    // fetch active Braze schedules
    const endIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const brazeRes = await fetch(
      `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endIso)}`,
      { headers: { 'Authorization': `Bearer ${brazeApiKey}` } },
    );

    const activeIds = new Set<string>();
    if (brazeRes.ok) {
      const data = await brazeRes.json();
      for (const sched of data.scheduled_broadcasts ?? []) {
        if (sched.schedule_id) activeIds.add(sched.schedule_id);
      }
    } else {
      console.warn('Braze scheduled_broadcasts fetch failed:', brazeRes.status);
    }

    let verified = 0, recreated = 0, skipped = 0;

    for (const row of rows as any[]) {
      if (row.dry_run) { skipped++; continue; }
      if (!row.braze_send_id) { skipped++; continue; }

      if (activeIds.size > 0 && activeIds.has(row.braze_send_id)) {
        verified++;
        continue;
      }
      // missing in Braze (or fetch failed) — only recreate if confirmed missing
      if (activeIds.size === 0) { skipped++; continue; }

      const match = row.wc_matches;
      if (!match) { skipped++; continue; }

      // build props + audience (simplified — entry_props will be re-enriched on next scheduler run)
      const target = featuredByCanonical.get(row.target_team_canonical);
      const audienceValue = target?.braze_attribute_value ?? row.target_team_canonical;
      const teamMatch = {
        OR: WC_TEAM_ATTRIBUTES.map(attr => ({
          custom_attribute: { custom_attribute_name: attr, comparison: 'equals', value: audienceValue },
        })),
      };

      // Dual-fan dedup parity with braze-worldcup-scheduler.buildAudience
      const opponentCanonical = match.home_team_canonical === row.target_team_canonical
        ? match.away_team_canonical
        : match.home_team_canonical;
      const opponentFeatured = featuredByCanonical.get(opponentCanonical);
      const clauses: any[] = [teamMatch];
      if (opponentFeatured && row.target_team_canonical.localeCompare(opponentCanonical) >= 0) {
        const opponentValue = opponentFeatured.braze_attribute_value ?? opponentCanonical;
        for (const attr of WC_TEAM_ATTRIBUTES) {
          clauses.push({
            custom_attribute: { custom_attribute_name: attr, comparison: 'does_not_equal', value: opponentValue },
          });
        }
      }
      if (holdoutEnabled) {
        clauses.push({ custom_attribute: { custom_attribute_name: HOLDOUT_ATTRIBUTE, comparison: 'does_not_equal', value: true } });
      }
      const audience = clauses.length === 1 ? teamMatch : { AND: clauses };

      const props = {
        tournament: 'WC2026',
        match_id: match.id,
        target_team_en: target?.display_name_en ?? row.target_team_canonical,
        target_team_ar: target?.display_name_ar ?? row.target_team_canonical,
        kickoff_utc: match.kickoff_utc,
        stage: match.stage,
        group_letter: match.group_letter,
        venue: match.venue,
        sig: row.signature,
      };

      try {
        const recreate = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/create`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${brazeApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvas_id: row.braze_canvas_id ?? brazeCanvasId,
            broadcast: true,
            schedule: { time: row.scheduled_send_at_utc },
            audience,
            canvas_entry_properties: props,
          }),
        });
        if (!recreate.ok) {
          const txt = await recreate.text();
          await supabase.from('wc_scheduler_logs').insert({
            function_name: 'pre-send-verification-worldcup',
            log_level: 'error',
            match_id: match.id,
            message: `Recreate failed (${recreate.status})`,
            context: { error: txt, ledger_id: row.id },
          });
          continue;
        }
        const data = await recreate.json();
        await supabase.from('wc_schedule_ledger').update({
          braze_send_id: data.schedule_id ?? row.braze_send_id,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);

        await supabase.from('wc_scheduler_logs').insert({
          function_name: 'pre-send-verification-worldcup',
          log_level: 'warn',
          match_id: match.id,
          message: 'Recreated missing Braze schedule',
          context: { ledger_id: row.id, target_team: row.target_team_canonical, new_schedule_id: data.schedule_id },
        });
        recreated++;
      } catch (e) {
        console.error('recreate error:', e);
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'pre-send-verification-worldcup',
      log_level: 'info',
      message: 'Pre-send verification complete',
      context: { checked: rows.length, verified, recreated, skipped, active_braze_schedules: activeIds.size },
    });

    return new Response(
      JSON.stringify({ checked: rows.length, verified, recreated, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('pre-send-verification-worldcup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } finally {
    if (lockAcquired) {
      await supabase.rpc('pg_advisory_unlock', { key: PRE_SEND_LOCK_KEY });
    }
  }
});
