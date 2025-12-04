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

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'consistency';

    if (action === 'consistency') {
      // Verify schedule consistency between ledger and Braze
      const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
      const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
      const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');

      if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
        throw new Error('Missing Braze configuration');
      }

      const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      // Fetch from Braze
      const brazeRes = await fetch(
        `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(ninetyDaysOut.toISOString())}`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${brazeApiKey}` },
        }
      );

      if (!brazeRes.ok) {
        throw new Error(`Failed to fetch Braze schedules: ${await brazeRes.text()}`);
      }

      // Fetch from ledger first to get our schedule IDs
      const { data: ledger } = await supabase
        .from('schedule_ledger')
        .select('*')
        .gte('send_at_utc', new Date().toISOString());

      const ledgerIds = new Set(ledger?.map(l => l.braze_schedule_id) || []);

      const brazeData = await brazeRes.json();
      // Filter by matching schedule_id to our ledger entries (not by campaign_id)
      const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
        ledgerIds.has(b.id) || ledgerIds.has(b.schedule_id)
      );
      const brazeIds = new Set(ourBroadcasts.map((b: any) => b.schedule_id));

      const inBrazeOnly = ourBroadcasts.filter((b: any) => !ledgerIds.has(b.schedule_id));
      const inLedgerOnly = ledger?.filter(l => !brazeIds.has(l.braze_schedule_id)) || [];

      return new Response(
        JSON.stringify({
          total_in_braze: ourBroadcasts.length,
          total_in_ledger: ledger?.length || 0,
          in_braze_only: inBrazeOnly.length,
          in_ledger_only: inLedgerOnly.length,
          braze_only_details: inBrazeOnly.map((b: any) => ({
            schedule_id: b.schedule_id,
            send_at: b.send_at,
            match_id: b.trigger_properties?.match_id,
          })),
          ledger_only_details: inLedgerOnly.map(l => ({
            schedule_id: l.braze_schedule_id,
            match_id: l.match_id,
            send_at: l.send_at_utc,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'logs') {
      // Fetch recent scheduler logs
      const limit = parseInt(url.searchParams.get('limit') || '100');
      const { data: logs } = await supabase
        .from('scheduler_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      // Aggregate statistics
      const stats = {
        total: logs?.length || 0,
        by_action: {} as Record<string, number>,
        by_function: {} as Record<string, number>,
        recent_errors: logs?.filter(l => l.action === 'error').slice(0, 10) || [],
      };

      for (const log of logs || []) {
        stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;
        stats.by_function[log.function_name] = (stats.by_function[log.function_name] || 0) + 1;
      }

      return new Response(
        JSON.stringify({ logs, stats }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'campaign') {
      // List all schedules for the campaign
      const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
      const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
      const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');

      if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
        throw new Error('Missing Braze configuration');
      }

      const ninetyDaysOut = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const brazeRes = await fetch(
        `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(ninetyDaysOut.toISOString())}`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${brazeApiKey}` },
        }
      );

      if (!brazeRes.ok) {
        throw new Error(`Failed to fetch Braze schedules: ${await brazeRes.text()}`);
      }

      // Fetch ledger to match by schedule_id
      const { data: ledger } = await supabase
        .from('schedule_ledger')
        .select('braze_schedule_id');
      const ledgerIds = new Set(ledger?.map(l => l.braze_schedule_id) || []);

      const brazeData = await brazeRes.json();
      // Filter by matching schedule_id to our ledger entries
      const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
        ledgerIds.has(b.id) || ledgerIds.has(b.schedule_id)
      );

      return new Response(
        JSON.stringify({
          campaign_id: brazeCampaignId,
          total_schedules: ourBroadcasts.length,
          schedules: ourBroadcasts.map((b: any) => ({
            schedule_id: b.schedule_id,
            send_at: b.next_send_time,
            match_id: b.trigger_properties?.match_id,
            home: b.trigger_properties?.home_en,
            away: b.trigger_properties?.away_en,
            competition: b.trigger_properties?.competition_en,
            sig: b.trigger_properties?.sig,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'preview') {
      // Preview next N upcoming matches from the database
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .gte('utc_date', new Date().toISOString())
        .order('utc_date', { ascending: true })
        .limit(limit);

      return new Response(
        JSON.stringify({
          count: matches?.length || 0,
          matches: matches?.map((m) => ({
            id: m.id,
            competition: m.competition,
            home: m.home_team,
            away: m.away_team,
            utc_date: m.utc_date,
            priority: m.priority,
          })) || [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'nuke') {
      // Emergency: cancel ALL future schedules for this campaign
      const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
      const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
      const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID');

      if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
        throw new Error('Missing Braze configuration');
      }

      const confirm = url.searchParams.get('confirm');
      if (confirm !== 'yes') {
        return new Response(
          JSON.stringify({ 
            error: 'Must pass ?confirm=yes to execute nuke operation',
            warning: 'This will cancel ALL future schedules for this campaign' 
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const daysAhead = parseInt(url.searchParams.get('days') || '365');
      const endIso = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

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

      // Fetch ledger to match by schedule_id
      const { data: ledger } = await supabase
        .from('schedule_ledger')
        .select('braze_schedule_id');
      const ledgerIds = new Set(ledger?.map(l => l.braze_schedule_id) || []);

      const brazeData = await brazeRes.json();
      // Filter by matching schedule_id to our ledger entries
      const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
        ledgerIds.has(b.id) || ledgerIds.has(b.schedule_id)
      );

      const now = new Date();
      let cancelled = 0;
      let skipped = 0;
      let errors = 0;

      for (const broadcast of ourBroadcasts) {
        const sendTime = new Date(broadcast.next_send_time);
        if (sendTime <= now) {
          skipped++;
          continue;
        }

        try {
          const cancelRes = await fetch(
            `${brazeEndpoint}/campaigns/trigger/schedule/delete`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${brazeApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                campaign_id: brazeCampaignId,
                schedule_id: broadcast.schedule_id,
              }),
            }
          );

          if (cancelRes.ok || cancelRes.status === 404) {
            cancelled++;
          } else {
            errors++;
            console.error(`Failed to cancel ${broadcast.schedule_id}: ${await cancelRes.text()}`);
          }
        } catch (error) {
          errors++;
          console.error(`Error cancelling ${broadcast.schedule_id}:`, error);
        }
      }

      // Clear the ledger
      await supabase.from('schedule_ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      return new Response(
        JSON.stringify({
          success: true,
          days_ahead: daysAhead,
          total_found: ourBroadcasts.length,
          cancelled,
          skipped,
          errors,
          ledger_cleared: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use: consistency, logs, campaign, preview, or nuke' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in braze-debug:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
