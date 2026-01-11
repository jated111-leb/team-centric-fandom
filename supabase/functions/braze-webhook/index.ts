import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrazeWebhookEvent {
  events: Array<{
    external_user_id?: string;
    user_id?: string;
    time?: number;
    timezone?: string;
    event_type?: string;
    campaign_id?: string;
    campaign_name?: string;
    message_variation_id?: string;
    canvas_id?: string;
    canvas_name?: string;
    canvas_variation_id?: string;
    canvas_step_id?: string;
    canvas_step_name?: string;
    send_id?: string;
    dispatch_id?: string;
    device_id?: string;
    platform?: string;
    os_version?: string;
    device_model?: string;
    app_id?: string;
    properties?: Record<string, any>;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('📨 Received Braze webhook');

    const payload: BrazeWebhookEvent = await req.json();
    const eventCount = payload.events?.length || 0;
    console.log(`Processing ${eventCount} events`);

    if (eventCount === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, matches_confirmed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ==================== PHASE 1: Extract all IDs we need to look up ====================
    const dispatchIds: string[] = [];
    const sendIds: string[] = [];
    const timeWindows: { start: string; end: string }[] = [];
    
    // Pre-process events to collect all lookup keys
    const processedEvents = payload.events.map(event => {
      const sentAt = event.time ? new Date(event.time * 1000).toISOString() : new Date().toISOString();
      const sentAtTime = new Date(sentAt);
      
      if (event.dispatch_id) dispatchIds.push(event.dispatch_id);
      if (event.send_id) sendIds.push(event.send_id);
      
      // Calculate time window for this event
      const windowStart = new Date(sentAtTime.getTime() - 10 * 60 * 1000).toISOString();
      const windowEnd = new Date(sentAtTime.getTime() + 10 * 60 * 1000).toISOString();
      timeWindows.push({ start: windowStart, end: windowEnd });

      return {
        event,
        sentAt,
        sentAtTime,
        externalUserId: event.external_user_id || event.user_id || 'unknown',
        eventType: event.event_type || 'unknown',
        campaignId: event.campaign_id || null,
        canvasId: event.canvas_id || null,
        canvasName: event.canvas_name || null,
        canvasStepName: event.canvas_step_name || null,
        sourceType: event.canvas_id ? 'canvas' : 'campaign',
        dispatchId: event.dispatch_id || null,
        sendId: event.send_id || null,
        properties: event.properties || {},
      };
    });

    // ==================== PHASE 2: Batch lookup schedule_ledger entries ====================
    // Single query to get all relevant schedule_ledger entries
    let ledgerEntries: Array<{ match_id: number; dispatch_id: string | null; send_id: string | null; send_at_utc: string }> = [];
    
    // Get overall time window bounds for a single range query
    const allTimeStarts = timeWindows.map(w => new Date(w.start).getTime());
    const allTimeEnds = timeWindows.map(w => new Date(w.end).getTime());
    const overallStart = new Date(Math.min(...allTimeStarts)).toISOString();
    const overallEnd = new Date(Math.max(...allTimeEnds)).toISOString();

    // Build OR conditions for dispatch_id and send_id lookups
    const orConditions: string[] = [];
    if (dispatchIds.length > 0) {
      orConditions.push(`dispatch_id.in.(${dispatchIds.join(',')})`);
    }
    if (sendIds.length > 0) {
      orConditions.push(`send_id.in.(${sendIds.join(',')})`);
    }

    // Query 1: Get ledger entries by dispatch_id/send_id OR within time window
    const { data: ledgerData } = await supabase
      .from('schedule_ledger')
      .select('match_id, dispatch_id, send_id, send_at_utc')
      .or(orConditions.length > 0 
        ? `${orConditions.join(',')},and(send_at_utc.gte.${overallStart},send_at_utc.lte.${overallEnd})`
        : `and(send_at_utc.gte.${overallStart},send_at_utc.lte.${overallEnd})`)
      .in('status', ['pending', 'sent']);

    if (ledgerData) {
      ledgerEntries = ledgerData;
      console.log(`📊 Fetched ${ledgerEntries.length} schedule_ledger entries in single query`);
    }

    // Create lookup maps for O(1) access
    const ledgerByDispatchId = new Map<string, number>();
    const ledgerBySendId = new Map<string, number>();
    const ledgerByTime: Array<{ match_id: number; send_at_utc: Date }> = [];

    for (const entry of ledgerEntries) {
      if (entry.dispatch_id) ledgerByDispatchId.set(entry.dispatch_id, entry.match_id);
      if (entry.send_id) ledgerBySendId.set(entry.send_id, entry.match_id);
      ledgerByTime.push({ match_id: entry.match_id, send_at_utc: new Date(entry.send_at_utc) });
    }

    // ==================== PHASE 3: Resolve match_ids for all events ====================
    const matchIdsToFetch = new Set<number>();
    const eventMatchIds: (number | null)[] = [];

    for (let i = 0; i < processedEvents.length; i++) {
      const pe = processedEvents[i];
      let matchId: number | null = null;

      // Check properties first
      if (pe.properties.match_id) {
        matchId = parseInt(pe.properties.match_id, 10);
      }

      // Strategy 1: Lookup by dispatch_id or send_id (O(1) now)
      if (!matchId && pe.dispatchId && ledgerByDispatchId.has(pe.dispatchId)) {
        matchId = ledgerByDispatchId.get(pe.dispatchId)!;
      }
      if (!matchId && pe.sendId && ledgerBySendId.has(pe.sendId)) {
        matchId = ledgerBySendId.get(pe.sendId)!;
      }

      // Strategy 2: Time-based correlation (O(n) but against cached data, not DB)
      if (!matchId && ledgerByTime.length > 0) {
        let closestEntry = ledgerByTime[0];
        let closestDiff = Math.abs(pe.sentAtTime.getTime() - closestEntry.send_at_utc.getTime());

        for (const entry of ledgerByTime) {
          const diff = Math.abs(pe.sentAtTime.getTime() - entry.send_at_utc.getTime());
          if (diff < closestDiff) {
            closestEntry = entry;
            closestDiff = diff;
          }
        }

        // Only use if within 10 minute window
        if (closestDiff <= 10 * 60 * 1000) {
          matchId = closestEntry.match_id;
        }
      }

      eventMatchIds.push(matchId);
      if (matchId) matchIdsToFetch.add(matchId);
    }

    // ==================== PHASE 4: Batch fetch all match details ====================
    const matchDetailsMap = new Map<number, { home_team: string; away_team: string; competition: string; utc_date: string }>();

    if (matchIdsToFetch.size > 0) {
      const { data: matchesData } = await supabase
        .from('matches')
        .select('id, home_team, away_team, competition, utc_date')
        .in('id', Array.from(matchIdsToFetch));

      if (matchesData) {
        for (const match of matchesData) {
          matchDetailsMap.set(match.id, {
            home_team: match.home_team,
            away_team: match.away_team,
            competition: match.competition,
            utc_date: match.utc_date,
          });
        }
        console.log(`📊 Fetched ${matchesData.length} match details in single query`);
      }
    }

    // ==================== PHASE 5: Build and insert all notification records ====================
    const matchIdsWithWebhooks = new Set<number>();
    const notificationRecords: Array<{
      external_user_id: string;
      braze_event_type: string;
      match_id: number | null;
      braze_schedule_id: string | null;
      campaign_id: string | null;
      canvas_id: string | null;
      canvas_name: string | null;
      canvas_step_name: string | null;
      source_type: string;
      home_team: string | null;
      away_team: string | null;
      competition: string | null;
      kickoff_utc: string | null;
      sent_at: string;
      raw_payload: any;
    }> = [];

    for (let i = 0; i < processedEvents.length; i++) {
      const pe = processedEvents[i];
      const matchId = eventMatchIds[i];
      
      let homeTeam = pe.properties.home_team || null;
      let awayTeam = pe.properties.away_team || null;
      let competition = pe.properties.competition || null;
      let kickoffUtc = pe.properties.kickoff_utc || null;

      // Enrich with match details if available
      if (matchId && matchDetailsMap.has(matchId)) {
        const matchDetails = matchDetailsMap.get(matchId)!;
        if (!homeTeam) homeTeam = matchDetails.home_team;
        if (!awayTeam) awayTeam = matchDetails.away_team;
        if (!competition) competition = matchDetails.competition;
        if (!kickoffUtc) kickoffUtc = matchDetails.utc_date;
        matchIdsWithWebhooks.add(matchId);
      }

      notificationRecords.push({
        external_user_id: pe.externalUserId,
        braze_event_type: pe.eventType,
        match_id: matchId,
        braze_schedule_id: pe.sendId || pe.dispatchId || null,
        campaign_id: pe.campaignId,
        canvas_id: pe.canvasId,
        canvas_name: pe.canvasName,
        canvas_step_name: pe.canvasStepName,
        source_type: pe.sourceType,
        home_team: homeTeam,
        away_team: awayTeam,
        competition: competition,
        kickoff_utc: kickoffUtc,
        sent_at: pe.sentAt,
        raw_payload: pe.event,
      });
    }

    // Single bulk insert for all notification records
    const { error: insertError } = await supabase
      .from('notification_sends')
      .insert(notificationRecords);

    if (insertError) {
      console.error('❌ Error bulk inserting notification sends:', insertError);
      throw insertError;
    }

    console.log(`✅ Bulk inserted ${notificationRecords.length} notification records`);

    // ==================== PHASE 6: Update schedule_ledger status with dispatch_id ====================
    if (matchIdsWithWebhooks.size > 0) {
      const matchIdsArray = Array.from(matchIdsWithWebhooks);
      console.log(`📊 Updating status to 'sent' for ${matchIdsArray.length} matches`);

      // Collect dispatch_ids for each match_id from processed events
      const matchDispatchMap = new Map<number, string>();
      for (let i = 0; i < processedEvents.length; i++) {
        const matchId = eventMatchIds[i];
        const dispatchId = processedEvents[i].dispatchId;
        if (matchId && dispatchId && !matchDispatchMap.has(matchId)) {
          matchDispatchMap.set(matchId, dispatchId);
        }
      }

      // Update each match's ledger entry with its dispatch_id
      const updatePromises = matchIdsArray.map(async (matchId) => {
        const dispatchId = matchDispatchMap.get(matchId) || null;
        const { error, data } = await supabase
          .from('schedule_ledger')
          .update({ 
            status: 'sent',
            dispatch_id: dispatchId,
          })
          .eq('match_id', matchId)
          .eq('status', 'pending')
          .select('match_id, braze_schedule_id');
        
        return { matchId, dispatchId, error, data };
      });

      const updateResults = await Promise.all(updatePromises);
      const successfulUpdates = updateResults.filter(r => !r.error && r.data && r.data.length > 0);
      const failedUpdates = updateResults.filter(r => r.error);

      if (failedUpdates.length > 0) {
        console.error('❌ Error updating some schedule_ledger entries:', failedUpdates.map(f => f.error));
      }

      console.log(`✅ Updated ${successfulUpdates.length} schedule_ledger entries to 'sent' with dispatch_id`);

      // Bulk insert scheduler logs for all successful updates
      if (successfulUpdates.length > 0) {
        const logRecords = successfulUpdates.flatMap(result => 
          (result.data || []).map(record => ({
            function_name: 'braze-webhook',
            match_id: record.match_id,
            action: 'webhook_confirmed',
            reason: 'Webhook confirmed notification delivery',
            details: { 
              schedule_id: record.braze_schedule_id,
              dispatch_id: result.dispatchId,
            },
          }))
        );

        await supabase.from('scheduler_logs').insert(logRecords);
      }
    }

    console.log(`📊 Summary: ${eventCount} events processed, ${matchIdsWithWebhooks.size} matches confirmed, ~4 DB queries total`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: eventCount,
        matches_confirmed: matchIdsWithWebhooks.size,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
