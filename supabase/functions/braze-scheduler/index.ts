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
      .eq('status', 'SCHEDULED')
      .order('utc_date', { ascending: true });

    if (matchError) throw matchError;

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
      // Only process matches with at least one featured team
      if (!FEATURED_TEAMS.includes(match.home_team) && !FEATURED_TEAMS.includes(match.away_team)) {
        continue;
      }

      const kickoffDate = new Date(match.utc_date);
      const sendAtDate = new Date(kickoffDate.getTime() - SEND_OFFSET_MINUTES * 60 * 1000);

      // Skip if send window has passed
      if (sendAtDate <= now) {
        console.log(`Match ${match.id}: send window passed`);
        skipped++;
        continue;
      }

      // Build audience for both teams
      const targetTeams = [match.home_team, match.away_team].filter(t => FEATURED_TEAMS.includes(t));
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
        } catch (error) {
          console.error(`Error updating schedule for match ${match.id}:`, error);
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
        } catch (error) {
          console.error(`Error creating schedule for match ${match.id}:`, error);
        }
      }
    }

    console.log(`Braze scheduler complete: scheduled=${scheduled}, updated=${updated}, skipped=${skipped}`);

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
