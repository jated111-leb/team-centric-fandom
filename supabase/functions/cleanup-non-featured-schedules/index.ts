import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY')!;
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting cleanup of non-featured team schedules...');

    // Get list of featured teams
    const { data: featuredTeams, error: featuredError } = await supabase
      .from('featured_teams')
      .select('team_name');

    if (featuredError) {
      throw new Error(`Failed to fetch featured teams: ${featuredError.message}`);
    }

    const featuredTeamNames = featuredTeams.map(t => t.team_name);
    console.log(`Featured teams: ${featuredTeamNames.join(', ')}`);

    // Find all schedules for matches that don't involve any featured teams
    const { data: schedules, error: schedulesError } = await supabase
      .from('schedule_ledger')
      .select(`
        id,
        braze_schedule_id,
        match_id,
        matches (
          home_team,
          away_team
        )
      `);

    if (schedulesError) {
      throw new Error(`Failed to fetch schedules: ${schedulesError.message}`);
    }

    console.log(`Total schedules in ledger: ${schedules.length}`);

    // Filter to non-featured team schedules
    const nonFeaturedSchedules = schedules.filter(schedule => {
      const match = schedule.matches as any;
      if (!match) return false;
      
      const homeTeamFeatured = featuredTeamNames.includes(match.home_team);
      const awayTeamFeatured = featuredTeamNames.includes(match.away_team);
      
      // Delete if neither team is featured
      return !homeTeamFeatured && !awayTeamFeatured;
    });

    console.log(`Found ${nonFeaturedSchedules.length} non-featured team schedules to delete`);

    if (nonFeaturedSchedules.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No non-featured team schedules found',
          deleted: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete from Braze in batches
    const brazeDeleteUrl = `${brazeEndpoint}/campaigns/trigger/schedule/delete`;
    const deletedFromBraze: string[] = [];
    const failedBrazeDeletes: Array<{ schedule_id: string; error: string }> = [];

    for (const schedule of nonFeaturedSchedules) {
      try {
        const brazeResponse = await fetch(brazeDeleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${brazeApiKey}`,
          },
          body: JSON.stringify({
            schedule_id: schedule.braze_schedule_id,
          }),
        });

        if (!brazeResponse.ok) {
          const errorText = await brazeResponse.text();
          console.error(`Failed to delete from Braze: ${schedule.braze_schedule_id}`, errorText);
          failedBrazeDeletes.push({
            schedule_id: schedule.braze_schedule_id,
            error: errorText,
          });
        } else {
          deletedFromBraze.push(schedule.braze_schedule_id);
          console.log(`Deleted from Braze: ${schedule.braze_schedule_id}`);
        }
        
        // Rate limit: 50ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error deleting from Braze: ${schedule.braze_schedule_id}`, error);
        failedBrazeDeletes.push({
          schedule_id: schedule.braze_schedule_id,
          error: errorMessage,
        });
      }
    }

    // Delete from schedule_ledger
    const scheduleIds = nonFeaturedSchedules.map(s => s.id);
    const { error: deleteError } = await supabase
      .from('schedule_ledger')
      .delete()
      .in('id', scheduleIds);

    if (deleteError) {
      console.error('Failed to delete from schedule_ledger:', deleteError);
      throw new Error(`Failed to delete from schedule_ledger: ${deleteError.message}`);
    }

    console.log(`Deleted ${scheduleIds.length} schedules from schedule_ledger`);

    // Log the cleanup action
    await supabase.from('scheduler_logs').insert({
      function_name: 'cleanup-non-featured-schedules',
      action: 'cleanup',
      reason: `Deleted ${nonFeaturedSchedules.length} non-featured team schedules`,
      details: {
        deleted_from_braze: deletedFromBraze.length,
        failed_braze_deletes: failedBrazeDeletes.length,
        deleted_from_ledger: scheduleIds.length,
        failed_braze_details: failedBrazeDeletes.slice(0, 10), // Log first 10 failures
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup completed',
        deleted: {
          from_braze: deletedFromBraze.length,
          from_ledger: scheduleIds.length,
        },
        failed: {
          braze_deletes: failedBrazeDeletes.length,
        },
        details: {
          failed_braze: failedBrazeDeletes.slice(0, 5), // Return first 5 failures
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Cleanup function error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
