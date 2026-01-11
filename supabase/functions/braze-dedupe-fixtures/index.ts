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

    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint) {
      throw new Error('Missing Braze configuration');
    }

    const url = new URL(req.url);
    const daysAhead = parseInt(url.searchParams.get('days') || '365');
    const endIso = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all future scheduled broadcasts from Braze
    const brazeRes = await fetch(
      `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endIso)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${brazeApiKey}` },
      }
    );

    if (!brazeRes.ok) {
      throw new Error(`Failed to fetch Braze schedules: ${await brazeRes.text()}`);
    }

    const brazeData = await brazeRes.json();
    const allBroadcasts = brazeData.scheduled_broadcasts || [];

    // Filter to both Campaign and Canvas broadcasts
    const ourBroadcasts = allBroadcasts.filter((b: any) => 
      b.campaign_id === brazeCampaignId ||
      b.campaign_api_id === brazeCampaignId ||
      b.campaign_api_identifier === brazeCampaignId ||
      b.canvas_id === brazeCanvasId ||
      b.canvas_api_id === brazeCanvasId
    );

    // Group by fixture signature: competition_key + kickoff_utc (yyyy-mm-ddThh:mm) + home_en + away_en
    const byFixture = new Map<string, any[]>();
    const now = new Date();

    for (const broadcast of ourBroadcasts) {
      const sendTime = new Date(broadcast.next_send_time);
      if (sendTime <= now) continue; // Skip past schedules

      // Handle both Campaign (trigger_properties) and Canvas (canvas_entry_properties) formats
      const props = broadcast.trigger_properties || broadcast.canvas_entry_properties || {};
      const key = [
        String(props.competition_key || '').toLowerCase(),
        String(props.kickoff_utc || '').slice(0, 16), // yyyy-mm-ddThh:mm
        String(props.home_en || '').toLowerCase(),
        String(props.away_en || '').toLowerCase()
      ].join('|');

      if (!key.replace(/\|/g, '').length) continue; // Skip invalid

      // Tag broadcast with its type for proper cancellation endpoint
      broadcast._isCampaign = !!(broadcast.campaign_id || broadcast.campaign_api_id);
      broadcast._isCanvas = !!(broadcast.canvas_id || broadcast.canvas_api_id);

      if (!byFixture.has(key)) {
        byFixture.set(key, []);
      }
      byFixture.get(key)!.push(broadcast);
    }

    let totalCancelled = 0;
    const cancelledDetails = [];

    // For each fixture, keep earliest schedule and cancel duplicates
    for (const [fixtureKey, schedules] of byFixture.entries()) {
      if (schedules.length <= 1) continue;

      // Sort by send time (earliest first)
      schedules.sort((a, b) => 
        new Date(a.next_send_time).getTime() - new Date(b.next_send_time).getTime()
      );

      const keep = schedules[0];
      const duplicates = schedules.slice(1);

      console.log(`Fixture ${fixtureKey}: keeping ${keep.schedule_id}, cancelling ${duplicates.length} duplicates`);

      for (const dup of duplicates) {
        try {
          // Cancel in Braze - use correct endpoint based on type
          let cancelled = false;
          
          // Try Campaign delete first if it looks like a Campaign
          if (dup._isCampaign && brazeCampaignId) {
            const cancelCampaignRes = await fetch(
              `${brazeEndpoint}/campaigns/trigger/schedule/delete`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${brazeApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  campaign_id: brazeCampaignId,
                  schedule_id: dup.schedule_id,
                }),
              }
            );
            
            if (cancelCampaignRes.ok) {
              cancelled = true;
              console.log(`Cancelled Campaign schedule ${dup.schedule_id}`);
            }
          }
          
          // Try Canvas delete if it's a Canvas or Campaign cancel failed
          if (dup._isCanvas || (!cancelled && brazeCanvasId)) {
            const cancelCanvasRes = await fetch(
              `${brazeEndpoint}/canvas/trigger/schedule/delete`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${brazeApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  canvas_id: brazeCanvasId,
                  schedule_id: dup.schedule_id,
                }),
              }
            );
            
            if (cancelCanvasRes.ok) {
              cancelled = true;
              console.log(`Cancelled Canvas schedule ${dup.schedule_id}`);
            } else if (!cancelled && cancelCanvasRes.status !== 404) {
              console.error(`Failed to cancel ${dup.schedule_id}: ${await cancelCanvasRes.text()}`);
              continue;
            }
          }
          
          if (!cancelled) {
            console.warn(`Could not cancel schedule ${dup.schedule_id} - may already be processed`);
            continue;
          }

          totalCancelled++;
          cancelledDetails.push({
            schedule_id: dup.schedule_id,
            fixture_key: fixtureKey,
            send_time: dup.next_send_time,
          });

          console.log(`Cancelled duplicate schedule ${dup.schedule_id}`);

          // Remove from ledger if exists
          const matchId = dup.trigger_properties?.match_id;
          if (matchId) {
            await supabase
              .from('schedule_ledger')
              .delete()
              .eq('braze_schedule_id', dup.schedule_id);
          }
        } catch (error) {
          console.error(`Error cancelling schedule ${dup.schedule_id}:`, error);
        }
      }
    }

    console.log(`Deduplication complete: cancelled ${totalCancelled} duplicate schedules`);

    return new Response(
      JSON.stringify({
        success: true,
        total_fixtures: byFixture.size,
        total_schedules: ourBroadcasts.length,
        cancelled_count: totalCancelled,
        cancelled_details: cancelledDetails,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in braze-dedupe-fixtures:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

