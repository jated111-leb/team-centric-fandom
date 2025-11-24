import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check feature flag
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', 'braze_notifications_enabled')
      .single();

    if (!flag?.enabled) {
      console.log('Feature flag disabled - skipping Braze reconcile');
      return new Response(
        JSON.stringify({ message: 'Feature disabled', cancelled: 0, cleaned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
      throw new Error('Missing Braze configuration');
    }

    const now = new Date();
    const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // Fetch all future scheduled broadcasts from Braze
    const brazeRes = await fetch(
      `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(ninetyDaysOut.toISOString())}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${brazeApiKey}`,
        },
      }
    );

    if (!brazeRes.ok) {
      throw new Error(`Failed to fetch Braze schedules: ${await brazeRes.text()}`);
    }

    const brazeData = await brazeRes.json();
    const allBroadcasts = brazeData.scheduled_broadcasts || [];

    // Filter to our campaign
    const ourBroadcasts = allBroadcasts.filter((broadcast: any) => {
      return broadcast.campaign_id === brazeCampaignId ||
             broadcast.campaign_api_id === brazeCampaignId ||
             broadcast.campaign_api_identifier === brazeCampaignId;
    });

    // Fetch our ledger
    const { data: ledgerEntries } = await supabase
      .from('schedule_ledger')
      .select('braze_schedule_id');

    const knownScheduleIds = new Set(
      ledgerEntries?.map(entry => entry.braze_schedule_id) || []
    );

    // Cancel orphaned schedules (in Braze but not in ledger)
    let cancelled = 0;
    for (const broadcast of ourBroadcasts) {
      if (!knownScheduleIds.has(broadcast.schedule_id)) {
        try {
          const cancelRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/delete`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              campaign_id: brazeCampaignId,
              schedule_id: broadcast.schedule_id,
            }),
          });

          if (cancelRes.ok) {
            console.log(`Cancelled orphaned schedule: ${broadcast.schedule_id}`);
            cancelled++;
          } else {
            const errorText = await cancelRes.text();
            console.error(`Failed to cancel ${broadcast.schedule_id}: ${errorText}`);
          }
        } catch (error) {
          console.error(`Error cancelling ${broadcast.schedule_id}:`, error);
        }
      }
    }

    // Clean up past matches from ledger
    const { error: deleteError } = await supabase
      .from('schedule_ledger')
      .delete()
      .lt('send_at_utc', now.toISOString());

    if (deleteError) {
      console.error('Error cleaning past ledger entries:', deleteError);
    }

    const { count: cleaned } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .lt('send_at_utc', now.toISOString());

    console.log(`Braze reconcile complete: cancelled=${cancelled}, cleaned=${cleaned || 0}`);

    return new Response(
      JSON.stringify({ cancelled, cleaned: cleaned || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in braze-reconcile:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
