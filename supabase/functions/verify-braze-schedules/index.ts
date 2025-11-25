import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeRestEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!brazeApiKey || !brazeRestEndpoint || !brazeCampaignId) {
      throw new Error('Missing required Braze configuration');
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Fetching all schedule_ledger entries...');

    // Fetch all schedule ledger entries
    const { data: schedules, error: fetchError } = await supabase
      .from('schedule_ledger')
      .select('*')
      .order('send_at_utc', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch schedule_ledger: ${fetchError.message}`);
    }

    console.log(`Found ${schedules?.length || 0} schedules to verify`);

    const results = {
      total: schedules?.length || 0,
      verified: [] as string[],
      missing: [] as string[],
      errors: [] as { schedule_id: string; error: string }[],
    };

    // Verify each schedule by attempting to update it in Braze
    for (const schedule of schedules || []) {
      try {
        console.log(`Verifying schedule ${schedule.braze_schedule_id}...`);

        // Attempt to update the schedule with the same time (no-op update)
        const updateResponse = await fetch(
          `${brazeRestEndpoint}/campaigns/trigger/schedule/update`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${brazeApiKey}`,
            },
            body: JSON.stringify({
              campaign_id: brazeCampaignId,
              schedule_id: schedule.braze_schedule_id,
              schedule: {
                time: schedule.send_at_utc,
              },
            }),
          }
        );

        const updateData = await updateResponse.json();

        if (updateResponse.ok) {
          console.log(`✅ Schedule ${schedule.braze_schedule_id} exists in Braze`);
          results.verified.push(schedule.braze_schedule_id);
        } else {
          console.log(`❌ Schedule ${schedule.braze_schedule_id} NOT found in Braze: ${updateData.message}`);
          results.missing.push(schedule.braze_schedule_id);
        }
      } catch (error) {
        console.error(`Error verifying schedule ${schedule.braze_schedule_id}:`, error);
        results.errors.push({
          schedule_id: schedule.braze_schedule_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('Verification complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in verify-braze-schedules:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
