import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function performs ledger-based health checks for schedule tracking.
// NOTE: Braze's /messages/scheduled_broadcasts API does NOT list API-triggered Canvas schedules,
// so we rely on the schedule_ledger as the source of truth.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    console.log('🔢 Performing ledger health check...');

    // 1. Count pending schedules (future only)
    const { count: pendingFutureCount, error: pendingError } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('send_at_utc', now.toISOString());

    if (pendingError) {
      throw new Error(`Failed to count pending entries: ${pendingError.message}`);
    }

    // 2. Count stale pending (past send_at_utc but still pending - these should have been sent)
    const { count: stalePendingCount, data: stalePendingData, error: staleError } = await supabase
      .from('schedule_ledger')
      .select('match_id, braze_schedule_id, send_at_utc, dispatch_id', { count: 'exact' })
      .eq('status', 'pending')
      .lt('send_at_utc', now.toISOString());

    if (staleError) {
      throw new Error(`Failed to count stale pending: ${staleError.message}`);
    }

    // 3. Count confirmed sent (with webhook confirmation in last 24h)
    const { count: confirmedSentCount, error: sentError } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gt('updated_at', twentyFourHoursAgo.toISOString());

    if (sentError) {
      throw new Error(`Failed to count sent entries: ${sentError.message}`);
    }

    // 4. Count cancelled/failed in last 24h
    const { count: cancelledCount, error: cancelledError } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled')
      .gt('updated_at', twentyFourHoursAgo.toISOString());

    if (cancelledError) {
      throw new Error(`Failed to count cancelled entries: ${cancelledError.message}`);
    }

    // 5. Find upcoming high-priority matches without schedules (gaps)
    const { data: upcomingMatches, error: matchesError } = await supabase
      .from('matches')
      .select('id, home_team, away_team, utc_date, priority')
      .gte('utc_date', oneHourFromNow.toISOString())
      .lte('utc_date', twentyFourHoursFromNow.toISOString())
      .in('priority', ['critical', 'high'])
      .order('utc_date', { ascending: true });

    if (matchesError) {
      throw new Error(`Failed to fetch upcoming matches: ${matchesError.message}`);
    }

    // Check which upcoming matches have schedules
    const upcomingMatchIds = upcomingMatches?.map(m => m.id) || [];
    let upcomingGaps: Array<{ match_id: number; home_team: string; away_team: string; kickoff: string; priority: string }> = [];

    if (upcomingMatchIds.length > 0) {
      const { data: scheduledMatches, error: scheduledError } = await supabase
        .from('schedule_ledger')
        .select('match_id')
        .in('match_id', upcomingMatchIds)
        .in('status', ['pending', 'sent']);

      if (scheduledError) {
        throw new Error(`Failed to check scheduled matches: ${scheduledError.message}`);
      }

      const scheduledMatchIds = new Set(scheduledMatches?.map(s => s.match_id) || []);
      upcomingGaps = (upcomingMatches || [])
        .filter(m => !scheduledMatchIds.has(m.id))
        .map(m => ({
          match_id: m.id,
          home_team: m.home_team,
          away_team: m.away_team,
          kickoff: m.utc_date,
          priority: m.priority,
        }));
    }

    // 6. Get count of schedules with confirmed dispatch_id (webhook verified)
    const { count: webhookVerifiedCount, error: verifiedError } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .not('dispatch_id', 'is', null);

    if (verifiedError) {
      throw new Error(`Failed to count webhook verified: ${verifiedError.message}`);
    }

    // Determine overall health status
    const hasIssues = (stalePendingCount || 0) > 0 || upcomingGaps.length > 0;

    // Log if issues found
    if (hasIssues) {
      await supabase.from('scheduler_logs').insert({
        function_name: 'reconcile-counts',
        action: 'health_check_issues',
        reason: `Stale: ${stalePendingCount || 0}, Gaps: ${upcomingGaps.length}`,
        details: {
          stale_pending_count: stalePendingCount || 0,
          upcoming_gaps: upcomingGaps.length,
          checked_at: now.toISOString(),
        },
      });
    }

    const result = {
      success: true,
      checked_at: now.toISOString(),
      ledger_health: {
        pending_future: pendingFutureCount || 0,
        stale_past_pending: stalePendingCount || 0,
        confirmed_sent_24h: confirmedSentCount || 0,
        webhook_verified_total: webhookVerifiedCount || 0,
        cancelled_24h: cancelledCount || 0,
      },
      stale_pending_details: (stalePendingData || []).slice(0, 10).map(s => ({
        match_id: s.match_id,
        schedule_id: s.braze_schedule_id,
        send_at_utc: s.send_at_utc,
        has_dispatch_id: !!s.dispatch_id,
      })),
      upcoming_gaps: upcomingGaps,
      has_issues: hasIssues,
      note: 'Braze API cannot list API-triggered Canvas schedules. The schedule_ledger is the source of truth. Webhook callbacks confirm actual delivery.',
    };

    console.log('Ledger health check complete:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in reconcile-counts:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
