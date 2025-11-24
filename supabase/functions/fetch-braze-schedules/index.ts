import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const BRAZE_CAMPAIGN_ID = Deno.env.get('BRAZE_CAMPAIGN_ID');

    if (!BRAZE_API_KEY || !BRAZE_REST_ENDPOINT || !BRAZE_CAMPAIGN_ID) {
      throw new Error('Missing required Braze configuration');
    }

    console.log('Fetching scheduled messages from Braze...');
    console.log('Campaign ID:', BRAZE_CAMPAIGN_ID);

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

    // Get all scheduled broadcasts - the response doesn't include campaign_id
    // so we'll return all schedules and let the UI handle any filtering needed
    const scheduledMessages = brazeData.scheduled_broadcasts || [];

    console.log(`Found ${scheduledMessages.length} scheduled messages total`);

    return new Response(
      JSON.stringify({
        success: true,
        total_schedules: scheduledMessages.length,
        schedules: scheduledMessages.map((schedule: any) => ({
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
