import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_TIMEOUT_MINUTES = 10; // Increased for safety

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const lockId = crypto.randomUUID();
  let lockAcquired = false;

  try {
    // Acquire row-level lock using scheduler_locks table with two-step approach
    const lockExpiry = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    const lockCheckTime = new Date();
    
    // Step 1: Check current lock state
    const { data: currentLock, error: checkError } = await supabase
      .from('scheduler_locks')
      .select('locked_at, locked_by, expires_at')
      .eq('lock_name', 'braze-reconcile')
      .maybeSingle();

    if (checkError) {
      console.error('Error checking lock state:', checkError);
      throw new Error('Failed to check lock state');
    }

    // Step 2: Determine if we can acquire the lock
    const canAcquire = 
      !currentLock?.locked_at || 
      !currentLock?.expires_at ||
      new Date(currentLock.expires_at) < lockCheckTime;

    if (!canAcquire) {
      console.log(`Another reconcile process is running - skipping (locked by: ${currentLock?.locked_by}, expires: ${currentLock?.expires_at})`);
      return new Response(
        JSON.stringify({ message: 'Already running', cancelled: 0, cleaned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Acquire the lock with simple update
    const { error: lockError } = await supabase
      .from('scheduler_locks')
      .update({ 
        locked_at: lockCheckTime.toISOString(),
        locked_by: lockId,
        expires_at: lockExpiry
      })
      .eq('lock_name', 'braze-reconcile');

    if (lockError) {
      console.error('Error acquiring lock:', lockError);
      throw new Error('Failed to acquire lock');
    }

    lockAcquired = true;
    console.log(`Lock acquired: ${lockId}, expires: ${lockExpiry}`);

    // Check if scheduler is currently running - avoid conflicts
    const { data: schedulerLock } = await supabase
      .from('scheduler_locks')
      .select('locked_at, expires_at')
      .eq('lock_name', 'braze-scheduler')
      .maybeSingle();

    if (schedulerLock?.locked_at && schedulerLock?.expires_at) {
      const expiresAt = new Date(schedulerLock.expires_at);
      if (expiresAt > new Date()) {
        console.log('Scheduler is currently running - skipping reconcile to avoid conflicts');
        return new Response(
          JSON.stringify({ message: 'Scheduler running, skipped', cancelled: 0, cleaned: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
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

    // Filter to our canvas
    const ourBroadcasts = allBroadcasts.filter((broadcast: any) => {
      return broadcast.canvas_id === brazeCanvasId ||
             broadcast.canvas_api_id === brazeCanvasId ||
             broadcast.canvas_api_identifier === brazeCanvasId;
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
          const cancelRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/delete`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              canvas_id: brazeCanvasId,
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
          const cancelRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/delete`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              canvas_id: brazeCanvasId,
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

    // Phase 1: Match-based deduplication - keep only the one in ledger per match
    for (const [matchId, schedules] of matchScheduleMap.entries()) {
      if (schedules.length > 1) {
        // Find the one in our ledger
        const { data: ledgerEntry } = await supabase
          .from('schedule_ledger')
          .select('braze_schedule_id')
          .eq('match_id', parseInt(matchId))
          .maybeSingle();
        
        for (const schedule of schedules) {
          // Keep the one that matches our ledger
          if (ledgerEntry && schedule.schedule_id === ledgerEntry.braze_schedule_id) {
            continue;
          }
          
          try {
            const cancelRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/delete`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${brazeApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                canvas_id: brazeCanvasId,
                schedule_id: schedule.schedule_id,
              }),
            });

            if (cancelRes.ok) {
              console.log(`Cancelled duplicate for match ${matchId}: ${schedule.schedule_id}`);
              matchDedupCancelled++;
              
              // Log the action
              await supabase.from('scheduler_logs').insert({
                function_name: 'braze-reconcile',
                match_id: parseInt(matchId),
                action: 'duplicate_cancelled',
                reason: 'Multiple schedules for same match',
                details: { schedule_id: schedule.schedule_id, kept: ledgerEntry?.braze_schedule_id },
              });
            }
          } catch (error) {
            console.error(`Error cancelling duplicate ${schedule.schedule_id}:`, error);
          }
        }
      }
    }

    // Mark past matches as 'sent' instead of deleting for audit trail
    const { error: updateError } = await supabase
      .from('schedule_ledger')
      .update({ status: 'sent' })
      .lt('send_at_utc', now.toISOString())
      .eq('status', 'pending');

    if (updateError) {
      console.error('Error marking past ledger entries as sent:', updateError);
    }

    // Get count of entries marked as sent
    const { count: markedAsSent } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent');

    console.log(`Marked ${markedAsSent || 0} entries as 'sent'`);

    // Only delete entries older than 30 days for cleanup
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const { error: deleteError } = await supabase
      .from('schedule_ledger')
      .delete()
      .lt('send_at_utc', thirtyDaysAgo.toISOString());

    if (deleteError) {
      console.error('Error deleting old ledger entries:', deleteError);
    }

    const { count: deleted } = await supabase
      .from('schedule_ledger')
      .select('*', { count: 'exact', head: true })
      .lt('send_at_utc', thirtyDaysAgo.toISOString());

    console.log(`Deleted ${deleted || 0} entries older than 30 days`);

    console.log(`Braze reconcile complete: cancelled=${cancelled}, signatureCancelled=${signatureCancelled}, matchDedupCancelled=${matchDedupCancelled}, markedAsSent=${markedAsSent || 0}, deleted=${deleted || 0}`);

    return new Response(
      JSON.stringify({ 
        cancelled, 
        signatureCancelled, 
        matchDedupCancelled, 
        markedAsSent: markedAsSent || 0,
        deleted: deleted || 0,
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
  } finally {
    // Always release the lock
    if (lockAcquired) {
      await supabase
        .from('scheduler_locks')
        .update({ locked_at: null, locked_by: null, expires_at: null })
        .eq('lock_name', 'braze-reconcile')
        .eq('locked_by', lockId);
      console.log(`Lock released: ${lockId}`);
    }
  }
});
