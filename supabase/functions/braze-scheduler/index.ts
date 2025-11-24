import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Featured teams that trigger notifications
const FEATURED_TEAMS = [
  'Real Madrid CF',
  'FC Barcelona',
  'Manchester City FC',
  'Manchester United FC',
  'Liverpool FC',
  'Arsenal FC',
  'FC Bayern München',
  'Paris Saint-Germain FC',
  'Juventus FC',
  'Inter Milan',
];

const SEND_OFFSET_MINUTES = 60; // Send 60 minutes before kickoff
const UPDATE_BUFFER_MINUTES = 20; // Don't update schedules within 20 minutes of send time

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
    const lockKey = 1001; // Unique identifier for braze-scheduler
    const { data: lockAcquired } = await supabase.rpc('pg_try_advisory_lock', { key: lockKey });
    
    if (!lockAcquired) {
      console.log('Another scheduler process is running - skipping');
      return new Response(
        JSON.stringify({ message: 'Already running', scheduled: 0, updated: 0, skipped: 0 }),
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
      console.log('Feature flag disabled - skipping Braze scheduler');
      return new Response(
        JSON.stringify({ message: 'Feature disabled', scheduled: 0 }),
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
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Fetch upcoming matches with featured teams
    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .gte('utc_date', now.toISOString())
      .lte('utc_date', thirtyDaysOut.toISOString())
      .in('status', ['SCHEDULED', 'TIMED'])
      .order('utc_date', { ascending: true });

    if (matchError) throw matchError;

    console.log(`Fetched ${matches?.length || 0} matches with SCHEDULED or TIMED status`);

    // Phase 3: Fetch team mappings for canonical name matching
    const { data: teamMappings } = await supabase
      .from('team_mappings')
      .select('*');

    // Helper function to find canonical team name
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

    // Fetch translations
    const { data: teamTranslations } = await supabase
      .from('team_translations')
      .select('*');

    const { data: compTranslations } = await supabase
      .from('competition_translations')
      .select('*');

    const teamArabicMap = new Map(
      teamTranslations?.map(t => [t.team_name, t.arabic_name]) || []
    );

    const compArabicMap = new Map(
      compTranslations?.map(c => [c.competition_code, c.arabic_name]) || []
    );

    const compEnglishMap = new Map(
      compTranslations?.map(c => [c.competition_code, c.english_name]) || []
    );

    let scheduled = 0;
    let updated = 0;
    let skipped = 0;

    for (const match of matches || []) {
      // Phase 3: Use canonical team mapping to identify featured teams
      const homeCanonical = findCanonicalTeam(match.home_team);
      const awayCanonical = findCanonicalTeam(match.away_team);
      
      const homeFeatured = homeCanonical && FEATURED_TEAMS.includes(homeCanonical);
      const awayFeatured = awayCanonical && FEATURED_TEAMS.includes(awayCanonical);
      
      if (!homeFeatured && !awayFeatured) {
        console.log(`Match ${match.id}: ${match.home_team} vs ${match.away_team} - no featured teams`);
        
        // Phase 4: Log skip
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'skipped',
          reason: 'No featured teams',
          details: { home: match.home_team, away: match.away_team },
        });
        continue;
      }

      console.log(`Processing match ${match.id}: ${match.home_team} vs ${match.away_team} at ${match.utc_date}`);

      const kickoffDate = new Date(match.utc_date);
      const sendAtDate = new Date(kickoffDate.getTime() - SEND_OFFSET_MINUTES * 60 * 1000);

      // Skip if send window has passed
      if (sendAtDate <= now) {
        console.log(`Match ${match.id}: send window passed (sendAt: ${sendAtDate.toISOString()}, now: ${now.toISOString()})`);
        skipped++;
        
        // Phase 4: Log skip
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'skipped',
          reason: 'Send window passed',
          details: { sendAt: sendAtDate.toISOString(), now: now.toISOString() },
        });
        continue;
      }

      // Build audience for both teams using canonical names
      const targetTeams = [
        homeFeatured ? homeCanonical : null,
        awayFeatured ? awayCanonical : null
      ].filter(t => t !== null) as string[];
      const audience = {
        OR: targetTeams.flatMap(team => [
          { custom_attribute: { custom_attribute_name: 'Team 1', comparison: 'equals', value: team } },
          { custom_attribute: { custom_attribute_name: 'Team 2', comparison: 'equals', value: team } },
          { custom_attribute: { custom_attribute_name: 'Team 3', comparison: 'equals', value: team } },
        ])
      };

      // Create signature for deduplication
      const signature = `${sendAtDate.toISOString()}|${targetTeams.sort().join('+')}`;

      // Check if schedule already exists
      const { data: existingSchedule } = await supabase
        .from('schedule_ledger')
        .select('*')
        .eq('match_id', match.id)
        .maybeSingle();

      // Build trigger properties
      const triggerProps = {
        match_id: match.id.toString(),
        competition_key: match.competition,
        competition_en: compEnglishMap.get(match.competition) || match.competition_name,
        competition_ar: compArabicMap.get(match.competition) || match.competition_name,
        home_en: match.home_team,
        away_en: match.away_team,
        home_ar: teamArabicMap.get(match.home_team) || match.home_team,
        away_ar: teamArabicMap.get(match.away_team) || match.away_team,
        kickoff_utc: match.utc_date,
        sig: signature,
      };

      if (existingSchedule) {
        // Check if signature changed
        if (existingSchedule.signature === signature) {
          console.log(`Match ${match.id}: unchanged`);
          skipped++;
          continue;
        }

        // Don't update within buffer window
        const minutesToSend = (sendAtDate.getTime() - now.getTime()) / 60000;
        if (minutesToSend < UPDATE_BUFFER_MINUTES) {
          console.log(`Match ${match.id}: within update buffer`);
          skipped++;
          
          // Phase 4: Log skip
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'skipped',
            reason: 'Within update buffer',
            details: { minutesToSend, buffer: UPDATE_BUFFER_MINUTES },
          });
          continue;
        }

        // Update existing schedule
        try {
          const updateRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              campaign_id: brazeCampaignId,
              schedule_id: existingSchedule.braze_schedule_id,
              schedule: { time: sendAtDate.toISOString() },
              audience,
              trigger_properties: triggerProps,
            }),
          });

          if (!updateRes.ok) {
            const errorText = await updateRes.text();
            console.error(`Failed to update schedule for match ${match.id}: ${errorText}`);
            continue;
          }

          // Update ledger
          await supabase
            .from('schedule_ledger')
            .update({
              signature,
              send_at_utc: sendAtDate.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', existingSchedule.id);

          console.log(`Match ${match.id}: updated schedule ${existingSchedule.braze_schedule_id}`);
          updated++;
          
          // Phase 4: Log success
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'updated',
            reason: 'Schedule updated successfully',
            details: { schedule_id: existingSchedule.braze_schedule_id },
          });
        } catch (error) {
          console.error(`Error updating schedule for match ${match.id}:`, error);
          
          // Phase 4: Log error
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'error',
            reason: 'Failed to update schedule',
            details: { error: error instanceof Error ? error.message : 'Unknown error' },
          });
        }
      } else {
        // Create new schedule
        try {
          const createRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              campaign_id: brazeCampaignId,
              broadcast: true,
              schedule: { time: sendAtDate.toISOString() },
              audience,
              trigger_properties: triggerProps,
            }),
          });

          if (!createRes.ok) {
            const errorText = await createRes.text();
            console.error(`Failed to create schedule for match ${match.id}: ${errorText}`);
            continue;
          }

          const createData = await createRes.json();

          // Store in ledger
          await supabase
            .from('schedule_ledger')
            .insert({
              match_id: match.id,
              braze_schedule_id: createData.schedule_id,
              signature,
              send_at_utc: sendAtDate.toISOString(),
            });

          console.log(`Match ${match.id}: created schedule ${createData.schedule_id}`);
          scheduled++;
          
          // Phase 4: Log success
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'created',
            reason: 'New schedule created successfully',
            details: { schedule_id: createData.schedule_id },
          });
        } catch (error) {
          console.error(`Error creating schedule for match ${match.id}:`, error);
          
          // Phase 4: Log error
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'error',
            reason: 'Failed to create schedule',
            details: { error: error instanceof Error ? error.message : 'Unknown error' },
          });
        }
      }
    }

    console.log(`Braze scheduler complete: scheduled=${scheduled}, updated=${updated}, skipped=${skipped}`);

    // Phase 2: Release advisory lock
    await supabase.rpc('pg_advisory_unlock', { key: lockKey });

    return new Response(
      JSON.stringify({ scheduled, updated, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in braze-scheduler:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
