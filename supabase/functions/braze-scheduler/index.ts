import { createClient } from 'npm:@supabase/supabase-js@2';
import { formatInTimeZone, toZonedTime } from 'npm:date-fns-tz@3.2.0';
import { format } from 'npm:date-fns@3.6.0';

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

    // Log all matches for diagnostics
    console.log('=== ALL FETCHED MATCHES (Diagnostic) ===');
    for (const m of matches || []) {
      const kickoff = new Date(m.utc_date);
      const hoursUntilKickoff = (kickoff.getTime() - now.getTime()) / 3600000;
      console.log(`  Match ${m.id}: ${m.home_team} vs ${m.away_team} | Kickoff: ${m.utc_date} (${hoursUntilKickoff.toFixed(1)}h) | Competition: ${m.competition}`);
    }
    console.log('=== END DIAGNOSTIC ===');

    // Phase 3: Fetch featured teams from database
    const { data: featuredTeamsData } = await supabase
      .from('featured_teams')
      .select('team_name');

    const FEATURED_TEAMS_FROM_DB = (featuredTeamsData || []).map(t => t.team_name);

    if (FEATURED_TEAMS_FROM_DB.length === 0) {
      console.log('No featured teams configured - skipping');
      return new Response(
        JSON.stringify({ message: 'No featured teams configured', scheduled: 0, updated: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${FEATURED_TEAMS_FROM_DB.length} featured teams: ${FEATURED_TEAMS_FROM_DB.join(', ')}`);

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

    // Helper function to generate and save Arabic translation for a team
    async function ensureTeamTranslation(
      teamName: string,
      teamArabicMap: Map<string, string>
    ): Promise<string> {
      // Check if translation already exists
      if (teamArabicMap.has(teamName)) {
        return teamArabicMap.get(teamName)!;
      }

      console.log(`🔄 Generating Arabic translation for: ${teamName}`);

      try {
        // Call Lovable AI to translate the team name
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: 'You are a sports translator specializing in football team names. Translate the given football team name to Arabic. Return ONLY the Arabic translation, nothing else. Use the commonly recognized Arabic name for the team.'
              },
              {
                role: 'user',
                content: `Translate this football team name to Arabic: ${teamName}`
              }
            ],
          }),
        });

        if (!response.ok) {
          console.error(`AI translation failed for ${teamName}: ${response.status}`);
          return teamName; // Fallback to English
        }

        const data = await response.json();
        const arabicName = data.choices[0].message.content.trim();

        // Save translation to database for future use
        const { error: insertError } = await supabase
          .from('team_translations')
          .insert({ team_name: teamName, arabic_name: arabicName })
          .select()
          .single();

        if (insertError) {
          // If duplicate, that's fine - another process might have created it
          if (insertError.code !== '23505') {
            console.error(`Error saving translation for ${teamName}:`, insertError);
          }
        } else {
          console.log(`✅ Saved Arabic translation: ${teamName} → ${arabicName}`);
          
          // Log the new translation
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            action: 'translation_generated',
            reason: `Auto-translated: ${teamName} → ${arabicName}`,
            details: { team_name: teamName, arabic_name: arabicName },
          });
        }

        // Update the local map
        teamArabicMap.set(teamName, arabicName);
        
        return arabicName;
      } catch (error) {
        console.error(`Error generating translation for ${teamName}:`, error);
        return teamName; // Fallback to English
      }
    }

    let scheduled = 0;
    let updated = 0;
    let skipped = 0;

    for (const match of matches || []) {
      // Phase 3: Use canonical team mapping to identify featured teams
      const homeCanonical = findCanonicalTeam(match.home_team);
      const awayCanonical = findCanonicalTeam(match.away_team);
      
      const homeFeatured = homeCanonical && FEATURED_TEAMS_FROM_DB.includes(homeCanonical);
      const awayFeatured = awayCanonical && FEATURED_TEAMS_FROM_DB.includes(awayCanonical);
      
      // Enhanced diagnostic logging for team mapping
      console.log(`🔍 Team Mapping Check for Match ${match.id}:`);
      console.log(`  Home: "${match.home_team}" → Canonical: "${homeCanonical || 'NOT MAPPED'}" → Featured: ${homeFeatured}`);
      console.log(`  Away: "${match.away_team}" → Canonical: "${awayCanonical || 'NOT MAPPED'}" → Featured: ${awayFeatured}`);
      
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

      // Format kickoff time for Arabic display using Baghdad timezone (Asia/Baghdad)
      const BAGHDAD_TIMEZONE = 'Asia/Baghdad';
      const baghdadTime = toZonedTime(kickoffDate, BAGHDAD_TIMEZONE);
      
      // Helper to convert digits to Arabic numerals
      const toArabicDigits = (str: string) => {
        const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return str.replace(/\d/g, (d) => arabicDigits[parseInt(d)]);
      };
      
      // Format kickoff_ar: "الساعة ٨:٠٠ م ٢٥-١١-٢٠٢٥"
      const hours24 = baghdadTime.getHours();
      const minutes = baghdadTime.getMinutes();
      const hours12 = hours24 % 12 || 12;
      const ampm = hours24 < 12 ? 'ص' : 'م';
      const day = baghdadTime.getDate();
      const month = baghdadTime.getMonth() + 1;
      const year = baghdadTime.getFullYear();
      
      const timeStr = `${hours12}:${minutes.toString().padStart(2, '0')}`;
      const dateStr = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year}`;
      const kickoff_ar = toArabicDigits(`الساعة ${timeStr} ${ampm} ${dateStr} (توقيت بغداد)`);
      
      // Format kickoff_baghdad: "YYYY-MM-DD HH:MM" in Baghdad timezone
      const kickoff_baghdad = formatInTimeZone(kickoffDate, BAGHDAD_TIMEZONE, 'yyyy-MM-dd HH:mm');

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

      // Ensure translations exist (will auto-generate if missing)
      const home_ar = await ensureTeamTranslation(match.home_team, teamArabicMap);
      const away_ar = await ensureTeamTranslation(match.away_team, teamArabicMap);

      // Build trigger properties
      const triggerProps = {
        match_id: match.id.toString(),
        competition_key: match.competition,
        competition_en: compEnglishMap.get(match.competition) || match.competition_name,
        competition_ar: compArabicMap.get(match.competition) || match.competition_name,
        home_en: match.home_team,
        away_en: match.away_team,
        home_ar: home_ar,
        away_ar: away_ar,
        kickoff_utc: match.utc_date,
        kickoff_baghdad: kickoff_baghdad,
        kickoff_ar: kickoff_ar,
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

    // Log summary to database for monitoring
    await supabase.from('scheduler_logs').insert({
      function_name: 'braze-scheduler',
      action: 'run_complete',
      reason: `Scheduled: ${scheduled}, Updated: ${updated}, Skipped: ${skipped}`,
      details: { 
        total_matches_fetched: matches?.length || 0,
        scheduled,
        updated,
        skipped,
        run_duration_ms: Date.now() - now.getTime()
      },
    });

    // Post-run deduplication: remove any duplicate fixture schedules
    try {
      console.log('Running post-run deduplication...');
      const brazeApiKey = Deno.env.get('BRAZE_API_KEY')!;
      const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT')!;
      const brazeCampaignId = Deno.env.get('BRAZE_CAMPAIGN_ID')!;
      const daysAhead = 365;
      const endIso = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

      const brazeRes = await fetch(
        `${brazeEndpoint}/messages/scheduled_broadcasts?end_time=${encodeURIComponent(endIso)}`,
        { method: 'GET', headers: { 'Authorization': `Bearer ${brazeApiKey}` } }
      );

      if (brazeRes.ok) {
        const brazeData = await brazeRes.json();
        const ourBroadcasts = (brazeData.scheduled_broadcasts || []).filter((b: any) => 
          b.campaign_id === brazeCampaignId ||
          b.campaign_api_id === brazeCampaignId ||
          b.campaign_api_identifier === brazeCampaignId
        );

        const byFixture = new Map<string, any[]>();
        const now = new Date();

        for (const broadcast of ourBroadcasts) {
          const sendTime = new Date(broadcast.next_send_time);
          if (sendTime <= now) continue;

          const props = broadcast.trigger_properties || {};
          const key = [
            String(props.competition_key || '').toLowerCase(),
            String(props.kickoff_utc || '').slice(0, 16),
            String(props.home_en || '').toLowerCase(),
            String(props.away_en || '').toLowerCase()
          ].join('|');

          if (!key.replace(/\|/g, '').length) continue;
          if (!byFixture.has(key)) byFixture.set(key, []);
          byFixture.get(key)!.push(broadcast);
        }

        let deduped = 0;
        for (const [fixtureKey, schedules] of byFixture.entries()) {
          if (schedules.length <= 1) continue;
          schedules.sort((a, b) => new Date(a.next_send_time).getTime() - new Date(b.next_send_time).getTime());
          const duplicates = schedules.slice(1);

          for (const dup of duplicates) {
            try {
              const cancelRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/delete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${brazeApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaign_id: brazeCampaignId, schedule_id: dup.schedule_id }),
              });
              if (cancelRes.ok || cancelRes.status === 404) deduped++;
            } catch (e) {
              console.error(`Dedupe cancel failed for ${dup.schedule_id}:`, e);
            }
          }
        }
        console.log(`Post-run deduplication complete: removed ${deduped} duplicate schedules`);
      }
    } catch (error) {
      console.error('Post-run deduplication failed:', error);
    }

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
