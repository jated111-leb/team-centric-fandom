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
    const BRAZE_CAMPAIGN_ID = Deno.env.get('BRAZE_CAMPAIGN_ID');

    if (!BRAZE_API_KEY || !BRAZE_REST_ENDPOINT || !BRAZE_CAMPAIGN_ID) {
      throw new Error('Missing required Braze configuration');
    }

    const { schedule_id } = await req.json();

    if (!schedule_id) {
      throw new Error('schedule_id is required');
    }

    console.log('Deleting scheduled message from Braze:', schedule_id);

    // Delete the scheduled message from Braze
    const brazeResponse = await fetch(
      `${BRAZE_REST_ENDPOINT}/messages/schedule/delete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BRAZE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schedule_id: schedule_id,
        }),
      }
    );

    if (!brazeResponse.ok) {
      const errorText = await brazeResponse.text();
      console.error('Braze API error:', brazeResponse.status, errorText);
      throw new Error(`Braze API error: ${brazeResponse.status} - ${errorText}`);
    }

    const brazeData = await brazeResponse.json();
    console.log('Braze delete response:', JSON.stringify(brazeData, null, 2));

    // Also remove from schedule_ledger if it exists
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: deleteError } = await supabase
      .from('schedule_ledger')
      .delete()
      .eq('braze_schedule_id', schedule_id);

    if (deleteError) {
      console.error('Error deleting from schedule_ledger:', deleteError);
      // Don't throw - Braze deletion succeeded, so report success
    } else {
      console.log('Removed schedule from schedule_ledger');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Schedule deleted successfully',
        schedule_id: schedule_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error deleting Braze schedule:', error);
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
