import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function compares counts between the schedule_ledger and Braze
// to detect any discrepancies that might indicate missed or duplicate schedules

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration');
    }

    const now = new Date();
    console.log('🔢 Reconciling counts between ledger and Braze...');

    // Count pending schedules in ledger (future only)
    const { count: ledgerPendingCount, error: ledgerError } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gt('send_at_utc', now.toISOString());

    if (ledgerError) {
      throw new Error(`Failed to count ledger entries: ${ledgerError.message}`);
    }

    // Fetch Braze schedules
    const daysAhead = 90;
    const endIso = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    
    const brazeRes = await fetch(
      `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endIso)}`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
    );

    if (!brazeRes.ok) {
      throw new Error(`Failed to fetch Braze schedules: ${await brazeRes.text()}`);
    }

    const brazeData = await brazeRes.json();
    const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
      b.canvas_id === brazeCanvasId ||
      b.canvas_api_id === brazeCanvasId
    );

    const brazeCount = ourBroadcasts.length;

    // Compare counts
    const discrepancy = (ledgerPendingCount || 0) - brazeCount;
    const hasDiscrepancy = discrepancy !== 0;

    console.log(`Ledger pending: ${ledgerPendingCount}, Braze schedules: ${brazeCount}, Discrepancy: ${discrepancy}`);

    // Get detailed breakdown
    const { data: ledgerSchedules } = await supabase
      .from('schedule_ledger')
      .select('match_id, braze_schedule_id')
      .eq('status', 'pending')
      .gt('send_at_utc', now.toISOString());

    const ledgerScheduleIds = new Set(ledgerSchedules?.map(s => s.braze_schedule_id) || []);
    const brazeScheduleIds = new Set(ourBroadcasts.map((b: any) => b.schedule_id));

    // Find orphaned schedules (in Braze but not in ledger)
    const orphanedInBraze = ourBroadcasts.filter((b: any) => !ledgerScheduleIds.has(b.schedule_id));
    
    // Find missing from Braze (in ledger but not in Braze)
    const missingFromBraze = ledgerSchedules?.filter(s => !brazeScheduleIds.has(s.braze_schedule_id)) || [];

    // Find match_ids with multiple schedules in Braze
    const matchIdCounts = new Map<string, number>();
    for (const broadcast of ourBroadcasts) {
      // Canvas uses canvas_entry_properties instead of trigger_properties
      const matchId = broadcast.canvas_entry_properties?.match_id || broadcast.trigger_properties?.match_id;
      if (matchId) {
        matchIdCounts.set(matchId, (matchIdCounts.get(matchId) || 0) + 1);
      }
    }
    const duplicateMatches = Array.from(matchIdCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([matchId, count]) => ({ match_id: matchId, count }));

    // Log if discrepancy found
    if (hasDiscrepancy || orphanedInBraze.length > 0 || missingFromBraze.length > 0 || duplicateMatches.length > 0) {
      await supabase.from('scheduler_logs').insert({
        function_name: 'reconcile-counts',
        action: 'count_discrepancy',
        reason: `Ledger: ${ledgerPendingCount}, Braze: ${brazeCount}, Diff: ${discrepancy}`,
        details: {
          ledger_pending_count: ledgerPendingCount,
          braze_count: brazeCount,
          discrepancy,
          orphaned_in_braze: orphanedInBraze.length,
          missing_from_braze: missingFromBraze.length,
          duplicate_matches: duplicateMatches.length,
          checked_at: now.toISOString(),
        },
      });
    }

    const result = {
      success: true,
      counts: {
        ledger_pending: ledgerPendingCount || 0,
        braze_scheduled: brazeCount,
        discrepancy,
      },
      issues: {
        orphaned_in_braze: orphanedInBraze.map((b: any) => ({
          schedule_id: b.schedule_id,
          match_id: b.canvas_entry_properties?.match_id || b.trigger_properties?.match_id,
          send_time: b.send_time || b.next_send_time,
        })),
        missing_from_braze: missingFromBraze.map(s => ({
          schedule_id: s.braze_schedule_id,
          match_id: s.match_id,
        })),
        duplicate_matches: duplicateMatches,
      },
      has_issues: hasDiscrepancy || orphanedInBraze.length > 0 || missingFromBraze.length > 0 || duplicateMatches.length > 0,
    };

    console.log('Count reconciliation complete:', result);

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
