import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BRAZE_API_KEY = Deno.env.get('BRAZE_API_KEY');
    const BRAZE_REST_ENDPOINT = Deno.env.get('BRAZE_REST_ENDPOINT');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!BRAZE_API_KEY || !BRAZE_REST_ENDPOINT || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required configuration');
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('Fetching scheduled messages from Braze...');

    // Calculate end_time (30 days from now) in ISO-8601 format
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    const endTime = endDate.toISOString();

    console.log('Fetching schedules until:', endTime);

    // Fetch all scheduled messages from Braze (requires end_time parameter)
    const brazeResponse = await fetch(
      `${BRAZE_REST_ENDPOINT}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endTime)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${BRAZE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!brazeResponse.ok) {
      const errorText = await brazeResponse.text();
      console.error('Braze API error:', brazeResponse.status, errorText);
      throw new Error(`Braze API error: ${brazeResponse.status} - ${errorText}`);
    }

    const brazeData = await brazeResponse.json();
    console.log('Braze response:', JSON.stringify(brazeData, null, 2));

    const allScheduledMessages = brazeData.scheduled_broadcasts || [];

    // Fetch schedule IDs from our schedule_ledger (these are for our campaign)
    const { data: ledgerSchedules, error: ledgerError } = await supabase
      .from('schedule_ledger')
      .select('braze_schedule_id, match_id, send_at_utc, created_at, updated_at');

    if (ledgerError) {
      console.error('Error fetching schedule ledger:', ledgerError);
      throw new Error('Failed to fetch schedule ledger');
    }

    // Create a Set of our schedule IDs for quick lookup
    const ourScheduleIds = new Set(ledgerSchedules?.map(s => s.braze_schedule_id) || []);

    // Filter to only schedules that are in our ledger
    const campaignSchedules = allScheduledMessages.filter((schedule: any) => 
      ourScheduleIds.has(schedule.id)
    );

    console.log(`Found ${campaignSchedules.length} scheduled messages for this campaign (out of ${allScheduledMessages.length} total)`);

    return new Response(
      JSON.stringify({
        success: true,
        total_schedules: campaignSchedules.length,
        schedules: campaignSchedules.map((schedule: any) => ({
          schedule_id: schedule.id,
          name: schedule.name,
          send_at: schedule.next_send_time,
          created_at: schedule.created_at || schedule.next_send_time,
          updated_at: schedule.updated_at || schedule.next_send_time,
          type: schedule.type,
          schedule_type: schedule.schedule_type,
        })),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error fetching Braze schedules:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
