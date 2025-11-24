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

    // Fetch all scheduled messages from Braze
    const brazeResponse = await fetch(
      `${BRAZE_REST_ENDPOINT}/messages/scheduled_broadcasts`,
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

    // Filter for our campaign
    const scheduledMessages = brazeData.scheduled_broadcasts || [];
    const campaignSchedules = scheduledMessages.filter(
      (msg: any) => msg.campaign_id === BRAZE_CAMPAIGN_ID
    );

    console.log(`Found ${campaignSchedules.length} scheduled messages for campaign ${BRAZE_CAMPAIGN_ID}`);

    return new Response(
      JSON.stringify({
        success: true,
        campaign_id: BRAZE_CAMPAIGN_ID,
        total_schedules: campaignSchedules.length,
        schedules: campaignSchedules.map((schedule: any) => ({
          schedule_id: schedule.schedule_id,
          name: schedule.name,
          send_at: schedule.send_at,
          created_at: schedule.created_at,
          updated_at: schedule.updated_at,
          messages: schedule.messages,
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
