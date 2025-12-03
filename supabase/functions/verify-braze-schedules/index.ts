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
    const now = new Date();

    console.log('🔍 Verifying Braze schedules...');

    // Fetch future scheduled broadcasts from Braze
    const daysAhead = 30;
    const endIso = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    
    const brazeRes = await fetch(
      `${brazeRestEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endIso)}`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
    );

    let brazeScheduleIds = new Set<string>();
    
    if (brazeRes.ok) {
      const brazeData = await brazeRes.json();
      const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
        b.campaign_id === brazeCampaignId ||
        b.campaign_api_id === brazeCampaignId ||
        b.campaign_api_identifier === brazeCampaignId
      );
      
      for (const broadcast of ourBroadcasts) {
        brazeScheduleIds.add(broadcast.schedule_id);
      }
      
      console.log(`Found ${brazeScheduleIds.size} active schedules in Braze`);
    } else {
      console.warn('Failed to fetch Braze scheduled broadcasts:', await brazeRes.text());
    }

    // Fetch all schedule ledger entries
    const { data: schedules, error: fetchError } = await supabase
      .from('schedule_ledger')
      .select('*, matches(home_team, away_team, utc_date)')
      .order('send_at_utc', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch schedule_ledger: ${fetchError.message}`);
    }

    console.log(`Found ${schedules?.length || 0} schedules in ledger to verify`);

    const results = {
      total: schedules?.length || 0,
      verified_in_braze: [] as any[],
      missing_from_braze: [] as any[],
      past_with_webhook: [] as any[],
      past_no_webhook: [] as any[], // STALE PENDING - Critical alerts
      future_pending: [] as any[],
    };

    for (const schedule of schedules || []) {
      const sendAtDate = new Date(schedule.send_at_utc);
      const isPast = sendAtDate < now;
      const match = schedule.matches;
      
      const scheduleInfo = {
        schedule_id: schedule.braze_schedule_id,
        match_id: schedule.match_id,
        status: schedule.status,
        send_at_utc: schedule.send_at_utc,
        home_team: match?.home_team || 'Unknown',
        away_team: match?.away_team || 'Unknown',
        kickoff_utc: match?.utc_date || null,
      };

      if (isPast) {
        // For past schedules, check if we received a webhook (status = 'sent')
        if (schedule.status === 'sent') {
          results.past_with_webhook.push(scheduleInfo);
        } else {
          // STALE PENDING - send time passed but no webhook received
          // Check if notification_sends has any entries for this match
          const { data: sends } = await supabase
            .from('notification_sends')
            .select('id')
            .eq('match_id', schedule.match_id)
            .limit(1);
          
          if (sends && sends.length > 0) {
            // Has webhook but status wasn't updated
            results.past_with_webhook.push({ ...scheduleInfo, note: 'Has webhooks but status not updated' });
          } else {
            // CRITICAL: No webhook received
            results.past_no_webhook.push(scheduleInfo);
            console.warn(`⚠️ STALE PENDING: Match ${schedule.match_id} (${match?.home_team} vs ${match?.away_team}) - no webhook received!`);
          }
        }
      } else {
        // For future schedules, verify they exist in Braze
        if (brazeScheduleIds.has(schedule.braze_schedule_id)) {
          results.verified_in_braze.push(scheduleInfo);
        } else {
          results.missing_from_braze.push(scheduleInfo);
          console.warn(`❌ MISSING FROM BRAZE: Match ${schedule.match_id} (${match?.home_team} vs ${match?.away_team}) - schedule ${schedule.braze_schedule_id} not found!`);
        }
        results.future_pending.push(scheduleInfo);
      }
    }

    // Log critical alerts
    if (results.past_no_webhook.length > 0) {
      await supabase.from('scheduler_logs').insert({
        function_name: 'verify-braze-schedules',
        action: 'stale_pending_detected',
        reason: `Found ${results.past_no_webhook.length} schedules with no webhook received`,
        details: { 
          stale_schedules: results.past_no_webhook,
          checked_at: now.toISOString()
        },
      });
    }

    if (results.missing_from_braze.length > 0) {
      await supabase.from('scheduler_logs').insert({
        function_name: 'verify-braze-schedules',
        action: 'missing_from_braze_detected',
        reason: `Found ${results.missing_from_braze.length} future schedules missing from Braze`,
        details: { 
          missing_schedules: results.missing_from_braze,
          checked_at: now.toISOString()
        },
      });
    }

    console.log('Verification complete:', {
      total: results.total,
      verified_in_braze: results.verified_in_braze.length,
      missing_from_braze: results.missing_from_braze.length,
      past_with_webhook: results.past_with_webhook.length,
      past_no_webhook: results.past_no_webhook.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.total,
          verified_in_braze: results.verified_in_braze.length,
          missing_from_braze: results.missing_from_braze.length,
          past_with_webhook: results.past_with_webhook.length,
          past_no_webhook: results.past_no_webhook.length,
        },
        alerts: {
          stale_pending: results.past_no_webhook,
          missing_from_braze: results.missing_from_braze,
        },
        details: results,
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
