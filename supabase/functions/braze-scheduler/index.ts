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
const LOCK_TIMEOUT_MINUTES = 10; // Lock expires after 10 minutes (increased for safety)

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
      .eq('lock_name', 'braze-scheduler')
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
      console.log(`Another scheduler process is running - skipping (locked by: ${currentLock?.locked_by}, expires: ${currentLock?.expires_at})`);
      return new Response(
        JSON.stringify({ message: 'Already running', scheduled: 0, updated: 0, skipped: 0 }),
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
      .eq('lock_name', 'braze-scheduler');

    if (lockError) {
      console.error('Error acquiring lock:', lockError);
      throw new Error('Failed to acquire lock');
    }

    lockAcquired = true;
    console.log(`Lock acquired: ${lockId}, expires: ${lockExpiry}`);

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
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration');
    }

    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Competitions we don't have streaming rights for - exclude from notifications
    const EXCLUDED_COMPETITIONS = [
      'FL1',  // Ligue 1 (France)
      'DED',  // Eredivisie (Dutch League)
      'EL',   // UEFA Europa League
      'ECL',  // UEFA Europa Conference League
    ];

    // Fetch upcoming matches with featured teams
    const { data: allMatches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .gte('utc_date', now.toISOString())
      .lte('utc_date', thirtyDaysOut.toISOString())
      .in('status', ['SCHEDULED', 'TIMED'])
      .order('utc_date', { ascending: true });

    if (matchError) throw matchError;

    // Filter out excluded competitions
    const matches = (allMatches || []).filter(match => !EXCLUDED_COMPETITIONS.includes(match.competition));
    
    console.log(`Fetched ${allMatches?.length || 0} matches, ${matches.length} after excluding non-licensed competitions (${EXCLUDED_COMPETITIONS.join(', ')})`)

    // Fetch featured teams from database with Braze attribute values
    const { data: featuredTeamsData } = await supabase
      .from('featured_teams')
      .select('team_name, braze_attribute_value');

    const FEATURED_TEAMS_FROM_DB = (featuredTeamsData || []).map(t => t.team_name);
    
    // Create mapping from canonical name to Braze attribute value
    const brazeAttributeMap = new Map(
      (featuredTeamsData || []).map(t => [t.team_name, t.braze_attribute_value || t.team_name])
    );

    if (FEATURED_TEAMS_FROM_DB.length === 0) {
      console.log('No featured teams configured - skipping');
      return new Response(
        JSON.stringify({ message: 'No featured teams configured', scheduled: 0, updated: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${FEATURED_TEAMS_FROM_DB.length} featured teams: ${FEATURED_TEAMS_FROM_DB.join(', ')}`);

    // Fetch team mappings for canonical name matching
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
    ): Promise<string | null> {
      // Check if translation already exists
      if (teamArabicMap.has(teamName)) {
        return teamArabicMap.get(teamName)!;
      }

      console.log(`🔄 Generating Arabic translation for: ${teamName}`);

      try {
        // Call Lovable AI to translate the team name with timeout
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased from 10)
        
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          signal: controller.signal,
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

        clearTimeout(timeout);

        if (!response.ok) {
          console.error(`AI translation failed for ${teamName}: ${response.status}`);
          return null; // Return null to indicate failure - DO NOT fall back to English
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
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        console.error(`Error generating translation for ${teamName}:`, isTimeout ? 'Timeout' : error);
        return null; // Return null to indicate failure - DO NOT fall back to English
      }
    }

    let scheduled = 0;
    let updated = 0;
    let skipped = 0;

    for (const match of matches || []) {
      // Use canonical team mapping to identify featured teams
      const homeCanonical = findCanonicalTeam(match.home_team);
      const awayCanonical = findCanonicalTeam(match.away_team);
      
      const homeFeatured = homeCanonical && FEATURED_TEAMS_FROM_DB.includes(homeCanonical);
      const awayFeatured = awayCanonical && FEATURED_TEAMS_FROM_DB.includes(awayCanonical);
      
      // Enhanced diagnostic logging for team mapping
      console.log(`🔍 Team Mapping Check for Match ${match.id}:`);
      console.log(`  Home: "${match.home_team}" → Canonical: "${homeCanonical || 'NOT MAPPED'}" → Featured: ${homeFeatured}`);
      console.log(`  Away: "${match.away_team}" → Canonical: "${awayCanonical || 'NOT MAPPED'}" → Featured: ${awayFeatured}`);
      
      // VALIDATION: Check for potential featured teams that aren't mapped
      // This catches scenarios where a team SHOULD be featured but mapping is missing
      const homeInHardcodedList = FEATURED_TEAMS.some(t => match.home_team.toLowerCase().includes(t.toLowerCase().split(' ')[0]));
      const awayInHardcodedList = FEATURED_TEAMS.some(t => match.away_team.toLowerCase().includes(t.toLowerCase().split(' ')[0]));
      
      if (homeInHardcodedList && !homeCanonical) {
        console.warn(`⚠️ UNMATCHED FEATURED TEAM: "${match.home_team}" appears to be a featured team but has no mapping!`);
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'unmatched_featured_team',
          reason: `Team "${match.home_team}" appears to be featured but has no team_mapping`,
          details: { team: match.home_team, position: 'home', match_date: match.match_date },
        });
      }
      
      if (awayInHardcodedList && !awayCanonical) {
        console.warn(`⚠️ UNMATCHED FEATURED TEAM: "${match.away_team}" appears to be a featured team but has no mapping!`);
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'unmatched_featured_team',
          reason: `Team "${match.away_team}" appears to be featured but has no team_mapping`,
          details: { team: match.away_team, position: 'away', match_date: match.match_date },
        });
      }
      
      if (!homeFeatured && !awayFeatured) {
        console.log(`Match ${match.id}: ${match.home_team} vs ${match.away_team} - no featured teams`);
        continue;
      }

      console.log(`Processing match ${match.id}: ${match.home_team} vs ${match.away_team} at ${match.utc_date}`);

      const kickoffDate = new Date(match.utc_date);
      let sendAtDate = new Date(kickoffDate.getTime() - SEND_OFFSET_MINUTES * 60 * 1000);

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

      // Simplified logic: if send window has passed, skip the match
      if (sendAtDate <= now) {
        console.log(`Match ${match.id}: missed scheduling window`);
        skipped++;
        
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'skipped',
          reason: 'Missed scheduling window',
          details: {
            kickoff: match.utc_date,
            sendAt: sendAtDate.toISOString(),
            now: now.toISOString(),
          },
        });
        continue;
      }

      // Ensure translations exist BEFORE any Braze API calls
      // If translation fails, skip this match entirely - no English fallback
      const home_ar = await ensureTeamTranslation(match.home_team, teamArabicMap);
      const away_ar = await ensureTeamTranslation(match.away_team, teamArabicMap);
      
      if (!home_ar || !away_ar) {
        console.error(`Match ${match.id}: Missing Arabic translation - skipping to prevent inconsistent content`);
        skipped++;
        
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'skipped',
          reason: 'Translation unavailable',
          details: { 
            home: match.home_team, 
            away: match.away_team,
            home_ar_available: !!home_ar,
            away_ar_available: !!away_ar
          },
        });
        continue;
      }

      // Build audience for both teams using Braze attribute values
      const targetTeams = [
        homeFeatured ? homeCanonical : null,
        awayFeatured ? awayCanonical : null
      ].filter(t => t !== null) as string[];
      
      // Convert canonical names to Braze attribute values for audience targeting
      const brazeTargetTeams = targetTeams.map(team => {
        const brazeValue = brazeAttributeMap.get(team) || team;
        if (!brazeAttributeMap.get(team)) {
          console.warn(`⚠️ No Braze attribute value for ${team} - using canonical name as fallback`);
        }
        return brazeValue;
      });
      
      const audience = {
        OR: brazeTargetTeams.flatMap(team => [
          { custom_attribute: { custom_attribute_name: 'Team 1', comparison: 'equals', value: team } },
          { custom_attribute: { custom_attribute_name: 'Team 2', comparison: 'equals', value: team } },
          { custom_attribute: { custom_attribute_name: 'Team 3', comparison: 'equals', value: team } },
        ])
      };

      // Create signature for deduplication - includes Arabic translations for content freshness
      // If Arabic names change, signature changes, triggering an update to Braze
      const signature = `${sendAtDate.toISOString()}|${targetTeams.sort().join('+')}|${home_ar}|${away_ar}`;

      // PRE-FLIGHT CHECK: Check if schedule already exists in ledger
      // This is now protected by a unique index on (match_id) WHERE status IN ('pending', 'sent')
      const { data: existingSchedule } = await supabase
        .from('schedule_ledger')
        .select('*')
        .eq('match_id', match.id)
        .in('status', ['pending', 'sent'])
        .maybeSingle();

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

      // CRITICAL FIX: Detect Campaign-format schedule IDs that need migration to Canvas
      // Campaign IDs are UUIDs, Canvas IDs are shorter alphanumeric
      const isOldCampaignFormat = existingSchedule?.braze_schedule_id && 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existingSchedule.braze_schedule_id);
      
      // Track if we need to create a new schedule (either fresh or migration)
      let needsNewSchedule = !existingSchedule;
      
      if (existingSchedule && isOldCampaignFormat) {
        console.warn(`⚠️ Match ${match.id}: Found old Campaign-format schedule ID - forcing re-creation with Canvas API`);
        
        // Delete the old ledger entry to allow fresh Canvas schedule
        await supabase
          .from('schedule_ledger')
          .delete()
          .eq('id', existingSchedule.id);
        
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-scheduler',
          match_id: match.id,
          action: 'campaign_migration',
          reason: 'Migrating from Campaign to Canvas format',
          details: { 
            old_schedule_id: existingSchedule.braze_schedule_id,
            old_signature: existingSchedule.signature
          },
        });
        
        // Flag for fresh Canvas schedule creation
        needsNewSchedule = true;
      } else if (existingSchedule) {
        // Normal existing Canvas schedule - check if needs update
        // Check if signature changed
        if (existingSchedule.signature === signature) {
          console.log(`Match ${match.id}: unchanged`);
          skipped++;
          
          // Log skipped unchanged schedules for monitoring
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'skipped_unchanged',
            reason: 'Schedule exists and unchanged',
            details: { 
              schedule_id: existingSchedule.braze_schedule_id,
              send_at_utc: existingSchedule.send_at_utc,
              signature
            },
          });
          continue;
        }

        // Don't update within buffer window
        const minutesToSend = (sendAtDate.getTime() - now.getTime()) / 60000;
        if (minutesToSend < UPDATE_BUFFER_MINUTES) {
          console.log(`Match ${match.id}: within update buffer`);
          skipped++;
          
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
          const updateRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              canvas_id: brazeCanvasId,
              schedule_id: existingSchedule.braze_schedule_id,
              schedule: { time: sendAtDate.toISOString() },
              audience,
              canvas_entry_properties: triggerProps,
            }),
          });

          if (!updateRes.ok) {
            const errorText = await updateRes.text();
            console.error(`Failed to update schedule for match ${match.id}: ${errorText}`);
            
            await supabase.from('scheduler_logs').insert({
              function_name: 'braze-scheduler',
              match_id: match.id,
              action: 'error',
              reason: 'Braze API update failed',
              details: { 
                error: errorText,
                status: updateRes.status,
                schedule_id: existingSchedule.braze_schedule_id 
              },
            });
            continue;
          }

          const updateData = await updateRes.json();

          // Update ledger with new dispatch_id and send_id if provided
          await supabase
            .from('schedule_ledger')
            .update({
              dispatch_id: updateData.dispatch_id || existingSchedule.dispatch_id,
              send_id: updateData.send_id || existingSchedule.send_id,
              signature,
              send_at_utc: sendAtDate.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('id', existingSchedule.id);

          console.log(`Match ${match.id}: updated schedule ${existingSchedule.braze_schedule_id}`);
          updated++;
          
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'updated',
            reason: 'Schedule updated successfully',
            details: { schedule_id: existingSchedule.braze_schedule_id },
          });
        } catch (error) {
          console.error(`Error updating schedule for match ${match.id}:`, error);
          
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'error',
            reason: 'Failed to update schedule',
            details: { error: error instanceof Error ? error.message : 'Unknown error' },
          });
        }
        continue; // Skip to next match after update attempt
      }
      
      // Create new schedule (fresh or migrated from Campaign)
      if (needsNewSchedule) {
        // STEP 1: Reserve slot in ledger FIRST (protected by unique index)
        const reservationId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from('schedule_ledger')
          .insert({
            match_id: match.id,
            braze_schedule_id: `pending-${reservationId}`, // Temporary placeholder
            signature,
            send_at_utc: sendAtDate.toISOString(),
            status: 'pending',
          });

        if (insertError) {
          // If duplicate key error, another process already created the schedule
          if (insertError.code === '23505') {
            console.log(`Match ${match.id}: schedule already being created by another process`);
            skipped++;
            continue;
          }
          console.error(`Failed to reserve ledger slot for match ${match.id}:`, insertError);
          continue;
        }

        // STEP 2: Call Braze API to create schedule
        try {
          const createRes = await fetch(`${brazeEndpoint}/canvas/trigger/schedule/create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              canvas_id: brazeCanvasId,
              broadcast: true,
              schedule: { time: sendAtDate.toISOString() },
              audience,
              canvas_entry_properties: triggerProps,
            }),
          });

          if (!createRes.ok) {
            const errorText = await createRes.text();
            console.error(`Failed to create schedule for match ${match.id}: ${errorText}`);
            
            // ROLLBACK: Delete the reservation since Braze call failed
            await supabase
              .from('schedule_ledger')
              .delete()
              .eq('match_id', match.id)
              .eq('braze_schedule_id', `pending-${reservationId}`);
            
            await supabase.from('scheduler_logs').insert({
              function_name: 'braze-scheduler',
              match_id: match.id,
              action: 'error',
              reason: 'Braze API create failed',
              details: { 
                error: errorText,
                status: createRes.status 
              },
            });
            continue;
          }

          const createData = await createRes.json();

          // STEP 3: Update ledger with actual Braze schedule ID
          await supabase
            .from('schedule_ledger')
            .update({
              braze_schedule_id: createData.schedule_id,
              dispatch_id: createData.dispatch_id || null,
              send_id: createData.send_id || null,
            })
            .eq('match_id', match.id)
            .eq('braze_schedule_id', `pending-${reservationId}`);

          console.log(`Match ${match.id}: created schedule ${createData.schedule_id}`);
          scheduled++;
          
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-scheduler',
            match_id: match.id,
            action: 'created',
            reason: 'New schedule created successfully',
            details: { schedule_id: createData.schedule_id },
          });
        } catch (error) {
          console.error(`Error creating schedule for match ${match.id}:`, error);
          
          // ROLLBACK: Delete the reservation since Braze call failed
          await supabase
            .from('schedule_ledger')
            .delete()
            .eq('match_id', match.id)
            .eq('braze_schedule_id', `pending-${reservationId}`);
          
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

    // NOTE: Post-run deduplication removed - it was dangerous and could delete correct schedules
    // The unique database constraint on match_id already prevents duplicates
    // Use braze-reconcile or braze-dedupe-fixtures for controlled deduplication if needed

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
  } finally {
    // Always release the lock
    if (lockAcquired) {
      await supabase
        .from('scheduler_locks')
        .update({ locked_at: null, locked_by: null, expires_at: null })
        .eq('lock_name', 'braze-scheduler')
        .eq('locked_by', lockId);
      console.log(`Lock released: ${lockId}`);
    }
  }
});
