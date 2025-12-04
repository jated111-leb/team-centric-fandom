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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();

    console.log('🔍 Verifying Braze schedules using dispatch_id verification...');

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
      confirmed: [] as any[],           // Has dispatch_id = Braze accepted it
      missing_dispatch_id: [] as any[], // No dispatch_id = creation may have failed
      past_with_webhook: [] as any[],   // Past + status='sent' or has notification_sends
      stale_pending: [] as any[],       // Past + no webhook received
      future_pending: [] as any[],      // Future schedules
    };

    for (const schedule of schedules || []) {
      const sendAtDate = new Date(schedule.send_at_utc);
      const isPast = sendAtDate < now;
      const match = schedule.matches;
      const hasDispatchId = !!schedule.dispatch_id;
      
      const scheduleInfo = {
        schedule_id: schedule.braze_schedule_id,
        dispatch_id: schedule.dispatch_id,
        match_id: schedule.match_id,
        status: schedule.status,
        send_at_utc: schedule.send_at_utc,
        home_team: match?.home_team || 'Unknown',
        away_team: match?.away_team || 'Unknown',
        kickoff_utc: match?.utc_date || null,
        has_dispatch_id: hasDispatchId,
      };

      if (isPast) {
        // For past schedules, check if we received a webhook (status = 'sent')
        if (schedule.status === 'sent') {
          results.past_with_webhook.push(scheduleInfo);
        } else {
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
            // STALE: No webhook received
            results.stale_pending.push(scheduleInfo);
            console.warn(`⚠️ STALE PENDING: Match ${schedule.match_id} (${match?.home_team} vs ${match?.away_team}) - no webhook received!`);
          }
        }
      } else {
        // For future schedules, verify based on dispatch_id
        if (hasDispatchId) {
          results.confirmed.push(scheduleInfo);
        } else {
          results.missing_dispatch_id.push(scheduleInfo);
          console.warn(`❌ MISSING DISPATCH_ID: Match ${schedule.match_id} (${match?.home_team} vs ${match?.away_team}) - schedule may not exist in Braze!`);
        }
        results.future_pending.push(scheduleInfo);
      }
    }

    // Log critical alerts
    if (results.stale_pending.length > 0) {
      await supabase.from('scheduler_logs').insert({
        function_name: 'verify-braze-schedules',
        action: 'stale_pending_detected',
        reason: `Found ${results.stale_pending.length} schedules with no webhook received`,
        details: { 
          stale_schedules: results.stale_pending,
          checked_at: now.toISOString()
        },
      });
    }

    if (results.missing_dispatch_id.length > 0) {
      await supabase.from('scheduler_logs').insert({
        function_name: 'verify-braze-schedules',
        action: 'missing_dispatch_id_detected',
        reason: `Found ${results.missing_dispatch_id.length} future schedules without dispatch_id`,
        details: { 
          missing_schedules: results.missing_dispatch_id,
          checked_at: now.toISOString()
        },
      });
    }

    console.log('Verification complete:', {
      total: results.total,
      confirmed: results.confirmed.length,
      missing_dispatch_id: results.missing_dispatch_id.length,
      past_with_webhook: results.past_with_webhook.length,
      stale_pending: results.stale_pending.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: results.total,
          confirmed: results.confirmed.length,
          missing_dispatch_id: results.missing_dispatch_id.length,
          past_with_webhook: results.past_with_webhook.length,
          stale_pending: results.stale_pending.length,
        },
        alerts: {
          stale_pending: results.stale_pending,
          missing_dispatch_id: results.missing_dispatch_id,
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
