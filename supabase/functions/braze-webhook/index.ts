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
        const eventType = event.event_type || 'unknown';
        const sentAt = event.time ? new Date(event.time * 1000).toISOString() : new Date().toISOString();
        
        // Extract trigger properties if available
        const properties = event.properties || {};
        
        // Try to extract match_id from properties
        let matchId = null;
        if (properties.match_id) {
          matchId = parseInt(properties.match_id, 10);
        }

        const notificationData = {
          external_user_id: externalUserId,
          braze_event_type: eventType,
          match_id: matchId,
          braze_schedule_id: event.send_id || event.dispatch_id || null,
          campaign_id: event.campaign_id || null,
          home_team: properties.home_team || null,
          away_team: properties.away_team || null,
          competition: properties.competition || null,
          kickoff_utc: properties.kickoff_utc || null,
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