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
    console.log(`Processing ${payload.events?.length || 0} events`);

    const insertPromises = payload.events.map(async (event) => {
      try {
        // Extract relevant data from event
        const externalUserId = event.external_user_id || event.user_id || 'unknown';
        const userIdSource = event.external_user_id ? 'external_user_id' : event.user_id ? 'user_id' : 'unknown';
        const eventType = event.event_type || 'unknown';
        const sentAt = event.time ? new Date(event.time * 1000).toISOString() : new Date().toISOString();
        
        console.log(`👤 User: ${externalUserId} (from ${userIdSource})`);
        
        // Handle both Campaign and Canvas sources
        const campaignId = event.campaign_id || null;
        const canvasId = event.canvas_id || null;
        const canvasName = event.canvas_name || null;
        const canvasStepName = event.canvas_step_name || null;
        const sourceType = canvasId ? 'canvas' : 'campaign';
        
        if (canvasId) {
          console.log(`🎨 Canvas event: ${canvasName} (${canvasId})`);
          if (canvasStepName) {
            console.log(`   Step: ${canvasStepName}`);
          }
        } else if (campaignId) {
          console.log(`📢 Campaign event: ${event.campaign_name || 'unnamed'} (${campaignId})`);
        }
        
        // Extract trigger properties if available
        const properties = event.properties || {};
        
        // Try to extract match_id from properties
        let matchId = null;
        if (properties.match_id) {
          matchId = parseInt(properties.match_id, 10);
        }

        let homeTeam = properties.home_team || null;
        let awayTeam = properties.away_team || null;
        let competition = properties.competition || null;
        let kickoffUtc = properties.kickoff_utc || null;

        // If no match details from properties, try to look them up
        const dispatchId = event.dispatch_id || null;
        const sendId = event.send_id || null;

        if (!matchId) {
          console.log(`🔍 Looking up match details for dispatch_id: ${dispatchId}, send_id: ${sendId}`);
          
          // Strategy 1: Try to match by dispatch_id or send_id
          if (dispatchId || sendId) {
            const orConditions = [];
            if (dispatchId) orConditions.push(`dispatch_id.eq.${dispatchId}`);
            if (sendId) orConditions.push(`send_id.eq.${sendId}`);
            
            const { data: ledgerEntry } = await supabase
              .from('schedule_ledger')
              .select('match_id')
              .or(orConditions.join(','))
              .maybeSingle();

            if (ledgerEntry?.match_id) {
              matchId = ledgerEntry.match_id;
              console.log(`✅ Found match_id ${matchId} from dispatch_id/send_id lookup`);
            }
          }

          // Strategy 2: Time-based correlation - find schedules sent within 2 minutes of this event
          if (!matchId) {
            const sentAtTime = new Date(sentAt);
            const windowStart = new Date(sentAtTime.getTime() - 2 * 60 * 1000).toISOString(); // 2 min before
            const windowEnd = new Date(sentAtTime.getTime() + 2 * 60 * 1000).toISOString(); // 2 min after
            
            console.log(`🕐 Time-based correlation: looking for schedules between ${windowStart} and ${windowEnd}`);
            
            const { data: timeMatchedEntries } = await supabase
              .from('schedule_ledger')
              .select('match_id, send_at_utc')
              .gte('send_at_utc', windowStart)
              .lte('send_at_utc', windowEnd)
              .in('status', ['pending', 'sent']);

            if (timeMatchedEntries && timeMatchedEntries.length > 0) {
              // If multiple matches, pick the closest one
              let closestEntry = timeMatchedEntries[0];
              let closestDiff = Math.abs(sentAtTime.getTime() - new Date(closestEntry.send_at_utc).getTime());
              
              for (const entry of timeMatchedEntries) {
                const diff = Math.abs(sentAtTime.getTime() - new Date(entry.send_at_utc).getTime());
                if (diff < closestDiff) {
                  closestEntry = entry;
                  closestDiff = diff;
                }
              }
              
              matchId = closestEntry.match_id;
              console.log(`✅ Found match_id ${matchId} via time correlation (diff: ${closestDiff}ms)`);
            } else {
              console.log(`⚠️ No schedule_ledger entries found in time window`);
            }
          }

          // Fetch match details if we found a match_id
          if (matchId) {
            const { data: matchData } = await supabase
              .from('matches')
              .select('home_team, away_team, competition, utc_date')
              .eq('id', matchId)
              .maybeSingle();

            if (matchData) {
              homeTeam = matchData.home_team;
              awayTeam = matchData.away_team;
              competition = matchData.competition;
              kickoffUtc = matchData.utc_date;
              console.log(`✅ Correlated match details: ${homeTeam} vs ${awayTeam}`);
            }
          } else {
            console.log(`⚠️ Could not correlate notification to any match`);
          }
        }

        const notificationData = {
          external_user_id: externalUserId,
          braze_event_type: eventType,
          match_id: matchId,
          braze_schedule_id: sendId || dispatchId || null,
          campaign_id: campaignId,
          canvas_id: canvasId,
          canvas_name: canvasName,
          canvas_step_name: canvasStepName,
          source_type: sourceType,
          home_team: homeTeam,
          away_team: awayTeam,
          competition: competition,
          kickoff_utc: kickoffUtc,
          sent_at: sentAt,
          raw_payload: event,
        };

        const { error } = await supabase
          .from('notification_sends')
          .insert(notificationData);

        if (error) {
          console.error(`❌ Error inserting notification send for user ${externalUserId}:`, error);
          throw error;
        }

        console.log(`✅ Logged ${eventType} event for user ${externalUserId}`);
      } catch (error) {
        console.error('Error processing event:', error);
        // Continue processing other events even if one fails
      }
    });

    await Promise.allSettled(insertPromises);

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: payload.events?.length || 0 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});