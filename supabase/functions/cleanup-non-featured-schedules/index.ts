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
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID')!;

    if (!brazeCanvasId) {
      throw new Error('Missing BRAZE_CANVAS_ID environment variable');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token or user not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (roleError || !roleData || roleData.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Get team mappings for canonical name resolution
    const { data: teamMappings, error: mappingsError } = await supabase
      .from('team_mappings')
      .select('pattern, canonical_name');

    if (mappingsError) {
      throw new Error(`Failed to fetch team mappings: ${mappingsError.message}`);
    }

    console.log(`Loaded ${teamMappings.length} team mappings`);

    // Helper function to resolve team to canonical name
    const resolveCanonicalTeam = (teamName: string): string => {
      for (const mapping of teamMappings) {
        const regex = new RegExp(mapping.pattern, 'i');
        if (regex.test(teamName)) {
          return mapping.canonical_name;
        }
      }
      return 'none';
    };

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

    // Filter to non-featured team schedules using canonical team matching
    const nonFeaturedSchedules = schedules.filter(schedule => {
      const match = schedule.matches as any;
      if (!match) return false;
      
      // Resolve teams to canonical names
      const homeCanonical = resolveCanonicalTeam(match.home_team);
      const awayCanonical = resolveCanonicalTeam(match.away_team);
      
      // Check if canonical names match featured teams
      const homeTeamFeatured = featuredTeamNames.includes(homeCanonical);
      const awayTeamFeatured = featuredTeamNames.includes(awayCanonical);
      
      console.log(`Match ${schedule.match_id}: ${match.home_team} (${homeCanonical}) vs ${match.away_team} (${awayCanonical}) - Home Featured: ${homeTeamFeatured}, Away Featured: ${awayTeamFeatured}`);
      
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

    // Delete from Braze first, then from schedule_ledger (safeguard to prevent orphans)
    const brazeDeleteUrl = `${brazeEndpoint}/canvas/trigger/schedule/delete`;
    const successfullyDeletedSchedules: Array<{ id: string; braze_schedule_id: string }> = [];
    const failedBrazeDeletes: Array<{ schedule_id: string; match_id: number; error: string }> = [];

    for (const schedule of nonFeaturedSchedules) {
      try {
        const brazeResponse = await fetch(brazeDeleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${brazeApiKey}`,
          },
          body: JSON.stringify({
            canvas_id: brazeCanvasId,
            schedule_id: schedule.braze_schedule_id,
          }),
        });

        if (!brazeResponse.ok) {
          const errorText = await brazeResponse.text();
          console.error(`Failed to delete from Braze: ${schedule.braze_schedule_id}`, errorText);
          failedBrazeDeletes.push({
            schedule_id: schedule.braze_schedule_id,
            match_id: schedule.match_id,
            error: errorText,
          });
        } else {
          // FIX: Only track as successful if Braze deletion succeeded
          successfullyDeletedSchedules.push({
            id: schedule.id,
            braze_schedule_id: schedule.braze_schedule_id,
          });
          console.log(`✅ Deleted from Braze: ${schedule.braze_schedule_id} for match ${schedule.match_id}`);
        }
        
        // Rate limit: 50ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error deleting from Braze: ${schedule.braze_schedule_id}`, error);
        failedBrazeDeletes.push({
          schedule_id: schedule.braze_schedule_id,
          match_id: schedule.match_id,
          error: errorMessage,
        });
      }
    }

    console.log(`Successfully deleted ${successfullyDeletedSchedules.length} schedules from Braze`);
    console.log(`Failed to delete ${failedBrazeDeletes.length} schedules from Braze`);

    // FIX: Only delete from schedule_ledger if Braze deletion was successful (safeguard)
    let deletedFromLedgerCount = 0;
    if (successfullyDeletedSchedules.length > 0) {
      const scheduleIds = successfullyDeletedSchedules.map(s => s.id);
      const { error: deleteError } = await supabase
        .from('schedule_ledger')
        .delete()
        .in('id', scheduleIds);

      if (deleteError) {
        console.error('Failed to delete from schedule_ledger:', deleteError);
        throw new Error(`Failed to delete from schedule_ledger: ${deleteError.message}`);
      }

      deletedFromLedgerCount = scheduleIds.length;
      console.log(`✅ Deleted ${deletedFromLedgerCount} schedules from schedule_ledger`);
    }

    // Log the cleanup action
    await supabase.from('scheduler_logs').insert({
      function_name: 'cleanup-non-featured-schedules',
      action: 'cleanup',
      reason: `Processed ${nonFeaturedSchedules.length} non-featured schedules: ${successfullyDeletedSchedules.length} deleted, ${failedBrazeDeletes.length} failed`,
      details: {
        total_non_featured: nonFeaturedSchedules.length,
        deleted_from_braze: successfullyDeletedSchedules.length,
        deleted_from_ledger: deletedFromLedgerCount,
        failed_braze_deletes: failedBrazeDeletes.length,
        failed_braze_details: failedBrazeDeletes.slice(0, 10), // Log first 10 failures
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup completed with canonical team mapping',
        processed: nonFeaturedSchedules.length,
        deleted: {
          from_braze: successfullyDeletedSchedules.length,
          from_ledger: deletedFromLedgerCount,
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
