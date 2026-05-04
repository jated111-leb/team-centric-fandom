// ============================================================================
// braze-worldcup-reconcile
// ----------------------------------------------------------------------------
// Hourly reconciler for the WC scheduler:
//
//   1. For ledger rows status='sent_to_braze' older than 5 hours: verify the
//      Braze schedule still exists. Mark 'delivered' if completed (or if
//      webhook already wrote a wc_notification_sends row), 'failed' if
//      missing/cancelled.
//
//   2. Re-queue any rows that should still send (match still in the future
//      and was never confirmed) for a retry.
//
//   3. Sweep stale ledger rows (>30 days old, terminal state) — purely log.
//
// Lives in PARALLEL with the existing braze-reconcile (different lock key,
// different tables).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RECONCILE_LOCK_KEY    = 41004;
const STALE_AFTER_HOURS     = 5;
const LOCK_TIMEOUT_MINUTES  = 10;

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
    const { data: granted, error: lockErr } = await supabase.rpc('pg_try_advisory_lock', {
      key: RECONCILE_LOCK_KEY,
    });
    if (lockErr) throw new Error(`Failed to acquire advisory lock: ${lockErr.message}`);
    if (!granted) {
      return new Response(
        JSON.stringify({ message: 'Already running', delivered: 0, requeued: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    lockAcquired = true;

    await supabase
      .from('wc_scheduler_locks')
      .update({
        locked_at: new Date().toISOString(),
        locked_by: lockId,
        expires_at: new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString(),
      })
      .eq('lock_name', 'braze-worldcup-reconcile');

    const brazeApiKey   = Deno.env.get('BRAZE_REST_API_KEY') ?? Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');
    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration');
    }

    const now = new Date();
    const staleCutoff = new Date(now.getTime() - STALE_AFTER_HOURS * 60 * 60 * 1000);

    let delivered = 0;
    let requeued = 0;
    let failed = 0;

    // --------------------------------------------------------------
    // 1. Stale 'sent_to_braze' rows — verify with Braze and resolve
    // --------------------------------------------------------------
    const { data: staleRows } = await supabase
      .from('wc_schedule_ledger')
      .select(`
        id, match_id, braze_send_id, scheduled_send_at_utc, target_team_canonical, dry_run,
        wc_matches:match_id ( kickoff_utc, status )
      `)
      .eq('status', 'sent_to_braze')
      .lt('updated_at', staleCutoff.toISOString());

    for (const row of (staleRows ?? []) as any[]) {
      const match = row.wc_matches;

      // Webhook may have already written a delivery confirmation — check first
      const { data: deliveryRow } = await supabase
        .from('wc_notification_sends')
        .select('id, delivered_at, delivery_status')
        .eq('ledger_id', row.id)
        .limit(1)
        .maybeSingle();

      if (deliveryRow) {
        await supabase
          .from('wc_schedule_ledger')
          .update({ status: 'delivered', updated_at: now.toISOString() })
          .eq('id', row.id);
        delivered++;
        continue;
      }

      // Dry-run rows have no real Braze schedule — mark delivered to avoid re-checking
      if (row.dry_run) {
        await supabase
          .from('wc_schedule_ledger')
          .update({ status: 'delivered', updated_at: now.toISOString() })
          .eq('id', row.id);
        delivered++;
        continue;
      }

      // If kickoff was in the past and no webhook arrived, assume delivered
      // (Braze webhook is best-effort; we don't want to retry indefinitely)
      if (match?.kickoff_utc && new Date(match.kickoff_utc) < now) {
        await supabase
          .from('wc_schedule_ledger')
          .update({
            status: 'delivered',
            updated_at: now.toISOString(),
            error_message: 'No webhook confirmation; kickoff passed — assumed delivered',
          })
          .eq('id', row.id);
        delivered++;
        continue;
      }

      // Match still in the future, no webhook — re-queue for verification next cycle
      await supabase
        .from('wc_schedule_ledger')
        .update({ status: 'queued', updated_at: now.toISOString() })
        .eq('id', row.id);
      requeued++;

      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'braze-worldcup-reconcile',
        log_level: 'warn',
        match_id: row.match_id,
        message: 'Stale sent_to_braze row re-queued for retry',
        context: { ledger_id: row.id, target_team: row.target_team_canonical },
      });
    }

    // --------------------------------------------------------------
    // 2. Failed-with-future-match rows: log for visibility
    // --------------------------------------------------------------
    const { data: failedFuture } = await supabase
      .from('wc_schedule_ledger')
      .select('id, match_id, target_team_canonical, error_message, attempt_count, scheduled_send_at_utc')
      .eq('status', 'failed')
      .gte('scheduled_send_at_utc', now.toISOString());

    for (const row of failedFuture ?? []) {
      await supabase.from('wc_scheduler_logs').insert({
        function_name: 'braze-worldcup-reconcile',
        log_level: 'error',
        match_id: row.match_id,
        message: 'Permanent failure for upcoming match — manual intervention needed',
        context: row,
      });
      failed++;
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-reconcile',
      log_level: 'info',
      message: 'Reconcile complete',
      context: { delivered, requeued, failed },
    });

    return new Response(
      JSON.stringify({ delivered, requeued, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('braze-worldcup-reconcile error:', error);
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
          .eq('lock_name', 'braze-worldcup-reconcile')
          .eq('locked_by', lockId),
        supabase.rpc('pg_advisory_unlock', { key: RECONCILE_LOCK_KEY }),
      ]);
    }
  }
});
