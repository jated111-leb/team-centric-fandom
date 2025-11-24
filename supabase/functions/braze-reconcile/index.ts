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

    // Phase 2: Acquire advisory lock to prevent concurrent runs
    const lockKey = 1002; // Unique identifier for braze-reconcile
    const { data: lockAcquired } = await supabase.rpc('pg_try_advisory_lock', { key: lockKey });
    
    if (!lockAcquired) {
      console.log('Another reconcile process is running - skipping');
      return new Response(
        JSON.stringify({ message: 'Already running', cancelled: 0, cleaned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      .select('braze_schedule_id, signature, match_id');

    const knownScheduleIds = new Set(
      ledgerEntries?.map(entry => entry.braze_schedule_id) || []
    );

    // Build set of desired signatures from current ledger
    const desiredSignatures = new Set(
      ledgerEntries?.map(entry => entry.signature) || []
    );

    // Build map of match_id to schedule for match-based deduplication
    const matchScheduleMap = new Map<string, any[]>();
    for (const broadcast of ourBroadcasts) {
      const matchId = broadcast.trigger_properties?.match_id;
      if (matchId) {
        if (!matchScheduleMap.has(matchId)) {
          matchScheduleMap.set(matchId, []);
        }
        matchScheduleMap.get(matchId)!.push(broadcast);
      }
    }

    // Cancel orphaned schedules (in Braze but not in ledger)
    let cancelled = 0;
    let signatureCancelled = 0;
    let matchDedupCancelled = 0;

    // Phase 1: Signature-based reconciliation
    for (const broadcast of ourBroadcasts) {
      const sig = broadcast.trigger_properties?.sig;
      if (sig && !desiredSignatures.has(sig) && knownScheduleIds.has(broadcast.schedule_id)) {
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
            console.log(`Cancelled outdated signature: ${broadcast.schedule_id}`);
            signatureCancelled++;
            
            // Log the action
            await supabase.from('scheduler_logs').insert({
              function_name: 'braze-reconcile',
              action: 'signature_cancelled',
              reason: 'Signature no longer in desired set',
              details: { schedule_id: broadcast.schedule_id, sig },
            });
          }
        } catch (error) {
          console.error(`Error cancelling by signature ${broadcast.schedule_id}:`, error);
        }
      }

      // Phase 1: Cancel orphaned schedules (in Braze but not in ledger)
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
            
            // Log the action
            await supabase.from('scheduler_logs').insert({
              function_name: 'braze-reconcile',
              action: 'orphan_cancelled',
              reason: 'Schedule not in ledger',
              details: { schedule_id: broadcast.schedule_id },
            });
          } else {
            const errorText = await cancelRes.text();
            console.error(`Failed to cancel ${broadcast.schedule_id}: ${errorText}`);
          }
        } catch (error) {
          console.error(`Error cancelling ${broadcast.schedule_id}:`, error);
        }
      }
    }

    // Phase 1: Match-based deduplication - keep only earliest schedule per match
    for (const [matchId, schedules] of matchScheduleMap.entries()) {
      if (schedules.length > 1) {
        // Sort by send time, keep earliest
        schedules.sort((a, b) => 
          new Date(a.schedule?.time || a.send_at).getTime() - 
          new Date(b.schedule?.time || b.send_at).getTime()
        );
        
        const [keep, ...duplicates] = schedules;
        console.log(`Match ${matchId}: keeping ${keep.schedule_id}, cancelling ${duplicates.length} duplicates`);
        
        for (const dup of duplicates) {
          try {
            const cancelRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/delete`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${brazeApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                campaign_id: brazeCampaignId,
                schedule_id: dup.schedule_id,
              }),
            });

            if (cancelRes.ok) {
              console.log(`Cancelled duplicate for match ${matchId}: ${dup.schedule_id}`);
              matchDedupCancelled++;
              
              // Log the action
              await supabase.from('scheduler_logs').insert({
                function_name: 'braze-reconcile',
                match_id: parseInt(matchId),
                action: 'duplicate_cancelled',
                reason: 'Multiple schedules for same match',
                details: { schedule_id: dup.schedule_id, kept: keep.schedule_id },
              });
            }
          } catch (error) {
            console.error(`Error cancelling duplicate ${dup.schedule_id}:`, error);
          }
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

    console.log(`Braze reconcile complete: cancelled=${cancelled}, signatureCancelled=${signatureCancelled}, matchDedupCancelled=${matchDedupCancelled}, cleaned=${cleaned || 0}`);

    // Phase 2: Release advisory lock
    await supabase.rpc('pg_advisory_unlock', { key: lockKey });

    return new Response(
      JSON.stringify({ 
        cancelled, 
        signatureCancelled, 
        matchDedupCancelled, 
        cleaned: cleaned || 0,
        total_cancelled: cancelled + signatureCancelled + matchDedupCancelled
      }),
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
