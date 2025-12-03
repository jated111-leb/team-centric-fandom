import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function should be called via cron job every 10 minutes
// It checks schedules that are due to send in the next 30 minutes
// and verifies they still exist in Braze, recreating them if necessary

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
    const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);

    console.log(`🔍 Pre-send verification: checking schedules between ${now.toISOString()} and ${thirtyMinutesFromNow.toISOString()}`);

    // Fetch schedules due to send in the next 30 minutes
    const { data: upcomingSchedules, error: fetchError } = await supabase
      .from('schedule_ledger')
      .select('*, matches(home_team, away_team, utc_date, competition)')
      .eq('status', 'pending')
      .gt('send_at_utc', now.toISOString())
      .lte('send_at_utc', thirtyMinutesFromNow.toISOString());

    if (fetchError) {
      throw new Error(`Failed to fetch upcoming schedules: ${fetchError.message}`);
    }

    if (!upcomingSchedules || upcomingSchedules.length === 0) {
      console.log('No schedules due in the next 30 minutes');
      return new Response(
        JSON.stringify({ success: true, checked: 0, verified: 0, recreated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${upcomingSchedules.length} schedules to verify`);

    // Fetch active Braze schedules
    const daysAhead = 1;
    const endIso = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
    
    const brazeRes = await fetch(
      `${brazeRestEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endIso)}`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
    );

    const brazeScheduleIds = new Set<string>();
    
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
    }

    // Fetch team translations for recreation
    const { data: teamTranslations } = await supabase
      .from('team_translations')
      .select('*');
    
    const teamArabicMap = new Map(
      teamTranslations?.map(t => [t.team_name, t.arabic_name]) || []
    );

    // Fetch competition translations
    const { data: compTranslations } = await supabase
      .from('competition_translations')
      .select('*');
    
    const compArabicMap = new Map(
      compTranslations?.map(c => [c.competition_code, c.arabic_name]) || []
    );
    
    const compEnglishMap = new Map(
      compTranslations?.map(c => [c.competition_code, c.english_name]) || []
    );

    // Fetch featured teams with Braze attribute values
    const { data: featuredTeamsData } = await supabase
      .from('featured_teams')
      .select('team_name, braze_attribute_value');
    
    const brazeAttributeMap = new Map(
      (featuredTeamsData || []).map(t => [t.team_name, t.braze_attribute_value || t.team_name])
    );

    // Fetch team mappings
    const { data: teamMappings } = await supabase
      .from('team_mappings')
      .select('*');

    const findCanonicalTeam = (teamName: string): string | null => {
      const normalized = teamName.toLowerCase();
      for (const mapping of teamMappings || []) {
        const regex = new RegExp(mapping.pattern, 'i');
        if (regex.test(normalized)) {
          return mapping.canonical_name;
        }
      }
      return null;
    };

    let verified = 0;
    let recreated = 0;
    let failed = 0;

    for (const schedule of upcomingSchedules) {
      const match = schedule.matches;
      
      if (brazeScheduleIds.has(schedule.braze_schedule_id)) {
        console.log(`✅ Schedule ${schedule.braze_schedule_id} verified in Braze`);
        verified++;
        continue;
      }

      // MISSING FROM BRAZE - Need to recreate!
      console.warn(`⚠️ Schedule ${schedule.braze_schedule_id} for match ${schedule.match_id} NOT FOUND in Braze - recreating!`);

      // Get canonical team names for audience
      const homeCanonical = findCanonicalTeam(match?.home_team || '');
      const awayCanonical = findCanonicalTeam(match?.away_team || '');
      
      const FEATURED_TEAMS_FROM_DB = (featuredTeamsData || []).map(t => t.team_name);
      const homeFeatured = homeCanonical && FEATURED_TEAMS_FROM_DB.includes(homeCanonical);
      const awayFeatured = awayCanonical && FEATURED_TEAMS_FROM_DB.includes(awayCanonical);

      const targetTeams = [
        homeFeatured ? homeCanonical : null,
        awayFeatured ? awayCanonical : null
      ].filter(t => t !== null) as string[];

      const brazeTargetTeams = targetTeams.map(team => brazeAttributeMap.get(team) || team);

      const audience = {
        OR: brazeTargetTeams.flatMap(team => [
          { custom_attribute: { custom_attribute_name: 'Team 1', comparison: 'equals', value: team } },
          { custom_attribute: { custom_attribute_name: 'Team 2', comparison: 'equals', value: team } },
          { custom_attribute: { custom_attribute_name: 'Team 3', comparison: 'equals', value: team } },
        ])
      };

      // Build trigger properties
      const home_ar = teamArabicMap.get(match?.home_team || '') || match?.home_team;
      const away_ar = teamArabicMap.get(match?.away_team || '') || match?.away_team;
      const comp_ar = compArabicMap.get(match?.competition || '') || match?.competition;
      const comp_en = compEnglishMap.get(match?.competition || '') || match?.competition;

      const triggerProps = {
        match_id: schedule.match_id.toString(),
        competition_key: match?.competition,
        competition_en: comp_en,
        competition_ar: comp_ar,
        home_en: match?.home_team,
        away_en: match?.away_team,
        home_ar: home_ar,
        away_ar: away_ar,
        kickoff_utc: match?.utc_date,
      };

      try {
        const createRes = await fetch(`${brazeRestEndpoint}/campaigns/trigger/schedule/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${brazeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            campaign_id: brazeCampaignId,
            broadcast: true,
            schedule: { time: schedule.send_at_utc },
            audience,
            trigger_properties: triggerProps,
          }),
        });

        if (!createRes.ok) {
          const errorText = await createRes.text();
          console.error(`❌ Failed to recreate schedule for match ${schedule.match_id}: ${errorText}`);
          
          await supabase.from('scheduler_logs').insert({
            function_name: 'pre-send-verification',
            match_id: schedule.match_id,
            action: 'recreation_failed',
            reason: 'Failed to recreate missing schedule',
            details: { 
              original_schedule_id: schedule.braze_schedule_id,
              error: errorText,
              status: createRes.status
            },
          });
          failed++;
          continue;
        }

        const createData = await createRes.json();

        // Update ledger with new schedule ID
        await supabase
          .from('schedule_ledger')
          .update({
            braze_schedule_id: createData.schedule_id,
            dispatch_id: createData.dispatch_id || null,
            send_id: createData.send_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', schedule.id);

        console.log(`✅ Recreated schedule for match ${schedule.match_id}: ${createData.schedule_id}`);
        recreated++;

        await supabase.from('scheduler_logs').insert({
          function_name: 'pre-send-verification',
          match_id: schedule.match_id,
          action: 'schedule_recreated',
          reason: 'Missing schedule recreated successfully',
          details: { 
            original_schedule_id: schedule.braze_schedule_id,
            new_schedule_id: createData.schedule_id,
            minutes_until_send: Math.round((new Date(schedule.send_at_utc).getTime() - now.getTime()) / 60000)
          },
        });
      } catch (error) {
        console.error(`Error recreating schedule for match ${schedule.match_id}:`, error);
        failed++;
      }
    }

    console.log(`Pre-send verification complete: checked=${upcomingSchedules.length}, verified=${verified}, recreated=${recreated}, failed=${failed}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: upcomingSchedules.length,
        verified,
        recreated,
        failed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in pre-send-verification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
