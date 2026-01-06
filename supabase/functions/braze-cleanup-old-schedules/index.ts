import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BRAZE_API_KEY = Deno.env.get('BRAZE_API_KEY');
    const BRAZE_REST_ENDPOINT = Deno.env.get('BRAZE_REST_ENDPOINT');
    const BRAZE_CANVAS_ID = Deno.env.get('BRAZE_CANVAS_ID');

    if (!BRAZE_API_KEY || !BRAZE_REST_ENDPOINT || !BRAZE_CANVAS_ID) {
      throw new Error('Missing required Braze configuration');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🧹 Starting cleanup of old schedule IDs from Nov 24...');

    // Get all schedule IDs from Nov 24 (before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: oldLogs, error: logsError } = await supabase
      .from('scheduler_logs')
      .select('details')
      .eq('action', 'scheduled')
      .lt('created_at', today.toISOString())
      .gte('created_at', '2025-11-24T00:00:00Z')
      .not('details', 'is', null);

    if (logsError) {
      throw new Error(`Failed to fetch old logs: ${logsError.message}`);
    }

    // Extract schedule IDs from logs
    const oldScheduleIds = new Set<string>();
    for (const log of oldLogs || []) {
      if (log.details && typeof log.details === 'object') {
        const details = log.details as any;
        if (details.braze_schedule_id) {
          oldScheduleIds.add(details.braze_schedule_id);
        }
      }
    }

    console.log(`Found ${oldScheduleIds.size} old schedule IDs from logs`);

    // Get current schedule IDs from schedule_ledger
    const { data: currentSchedules, error: ledgerError } = await supabase
      .from('schedule_ledger')
      .select('braze_schedule_id');

    if (ledgerError) {
      throw new Error(`Failed to fetch current schedules: ${ledgerError.message}`);
    }

    const currentScheduleIds = new Set(
      (currentSchedules || []).map(s => s.braze_schedule_id)
    );

    // Filter out current schedule IDs
    const scheduleIdsToDelete = Array.from(oldScheduleIds).filter(
      id => !currentScheduleIds.has(id)
    );

    console.log(`${scheduleIdsToDelete.length} old schedules to delete (${currentScheduleIds.size} are current)`);

    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    // Delete each old schedule ID from Braze
    for (const scheduleId of scheduleIdsToDelete) {
      try {
        console.log(`Attempting to delete schedule: ${scheduleId}`);
        
        const brazeResponse = await fetch(
          `${BRAZE_REST_ENDPOINT}/canvas/trigger/schedule/delete`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${BRAZE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              canvas_id: BRAZE_CANVAS_ID,
              schedule_id: scheduleId,
            }),
          }
        );

        const brazeData = await brazeResponse.json();

        if (brazeResponse.ok) {
          console.log(`✅ Successfully deleted schedule: ${scheduleId}`);
          successCount++;
        } else {
          // Check if it's a "not found" error
          if (brazeData.message?.includes('not found') || brazeData.message?.includes('does not exist')) {
            console.log(`ℹ️ Schedule not found (already sent/expired): ${scheduleId}`);
            notFoundCount++;
          } else {
            console.error(`❌ Failed to delete schedule ${scheduleId}:`, brazeData);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Error deleting schedule ${scheduleId}:`, error);
        errorCount++;
      }
    }

    const result = {
      total_old_schedules: oldScheduleIds.size,
      current_schedules: currentScheduleIds.size,
      attempted_deletions: scheduleIdsToDelete.length,
      successfully_cancelled: successCount,
      not_found: notFoundCount,
      errors: errorCount,
    };

    console.log('🧹 Cleanup complete:', result);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in cleanup function:', error);
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
