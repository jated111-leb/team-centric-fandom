import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_TIMEOUT_MINUTES = 10;

// Competitions excluded from congrats notifications (same as pre-match)
const EXCLUDED_COMPETITIONS = ['FL1', 'DED', 'EL', 'ECL'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const lockId = crypto.randomUUID();
  let lockAcquired = false;

  try {
    // ==================== AUTH ====================
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCronCall = body.cron_secret && cronSecret && body.cron_secret === cronSecret;
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') || '';

    if (isCronCall) {
      console.log('✅ Authenticated via cron secret');
    } else if (authHeader) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), 
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
      if (!roleData || roleData.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), 
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log('✅ Authenticated via admin JWT');
    } else {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ==================== FEATURE FLAG ====================
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', 'congrats_notifications_enabled')
      .single();

    if (!flag?.enabled) {
      console.log('🚫 congrats_notifications_enabled flag is disabled - skipping');
      return new Response(JSON.stringify({ message: 'Feature disabled', processed: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ==================== LOCK ====================
    const lockExpiry = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    const lockCheckTime = new Date();

    const { data: currentLock } = await supabase
      .from('scheduler_locks')
      .select('locked_at, locked_by, expires_at')
      .eq('lock_name', 'braze-congrats')
      .maybeSingle();

    const canAcquire = !currentLock?.locked_at || !currentLock?.expires_at || new Date(currentLock.expires_at) < lockCheckTime;
    if (!canAcquire) {
      console.log(`Another braze-congrats process is running - skipping`);
      return new Response(JSON.stringify({ message: 'Already running', processed: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('scheduler_locks').update({
      locked_at: lockCheckTime.toISOString(),
      locked_by: lockId,
      expires_at: lockExpiry,
    }).eq('lock_name', 'braze-congrats');

    lockAcquired = true;
    console.log(`🔒 Lock acquired: ${lockId}`);

    // ==================== BRAZE CONFIG ====================
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_CONGRATS_CAMPAIGN_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
      throw new Error('Missing Braze congrats configuration (BRAZE_API_KEY, BRAZE_REST_ENDPOINT, or BRAZE_CONGRATS_CAMPAIGN_ID)');
    }

    // ==================== FETCH PENDING MATCHES ====================
    const { data: pendingMatches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'FINISHED')
      .eq('congrats_status', 'pending')
      .not('score_home', 'is', null)
      .not('score_away', 'is', null);

    if (matchError) throw matchError;

    if (!pendingMatches || pendingMatches.length === 0) {
      console.log('📭 No pending congrats matches found');
      return new Response(JSON.stringify({ message: 'No pending matches', processed: 0, sent: 0, skipped: 0 }), 
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`📋 Found ${pendingMatches.length} pending congrats matches`);

    // ==================== LOAD TEAM MAPPINGS & TRANSLATIONS ====================
    const [
      { data: featuredTeamsData },
      { data: teamMappings },
      { data: teamTranslations },
      { data: compTranslations },
    ] = await Promise.all([
      supabase.from('featured_teams').select('team_name, braze_attribute_value'),
      supabase.from('team_mappings').select('*'),
      supabase.from('team_translations').select('*'),
      supabase.from('competition_translations').select('*'),
    ]);

    const featuredTeamNames = (featuredTeamsData || []).map(t => t.team_name);
    const brazeAttributeMap = new Map((featuredTeamsData || []).map(t => [t.team_name, t.braze_attribute_value || t.team_name]));
    const teamArabicMap = new Map((teamTranslations || []).map(t => [t.team_name, t.arabic_name]));
    const compArabicMap = new Map((compTranslations || []).map(c => [c.competition_code, c.arabic_name]));
    const compEnglishMap = new Map((compTranslations || []).map(c => [c.competition_code, c.english_name]));

    const findCanonicalTeam = (teamName: string): string | null => {
      for (const mapping of teamMappings || []) {
        const regex = new RegExp(mapping.pattern, 'i');
        if (regex.test(teamName.toLowerCase())) {
          return mapping.canonical_name;
        }
      }
      return null;
    };

    // Helper to generate Arabic translation (reused from braze-scheduler)
    async function ensureTeamTranslation(teamName: string): Promise<string | null> {
      if (teamArabicMap.has(teamName)) return teamArabicMap.get(teamName)!;
      
      console.log(`🔄 Generating Arabic translation for: ${teamName}`);
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          signal: controller.signal,
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'You are a sports translator specializing in football team names. Translate the given football team name to Arabic. Return ONLY the Arabic translation, nothing else. Use the commonly recognized Arabic name for the team.' },
              { role: 'user', content: `Translate this football team name to Arabic: ${teamName}` },
            ],
          }),
        });
        clearTimeout(timeout);

        if (!response.ok) { console.error(`AI translation failed for ${teamName}: ${response.status}`); return null; }
        const data = await response.json();
        const arabicName = data.choices[0].message.content.trim();

        await supabase.from('team_translations').insert({ team_name: teamName, arabic_name: arabicName });
        teamArabicMap.set(teamName, arabicName);
        console.log(`✅ Saved Arabic translation: ${teamName} → ${arabicName}`);
        return arabicName;
      } catch (error) {
        console.error(`Error generating translation for ${teamName}:`, error);
        return null;
      }
    }

    // ==================== PROCESS EACH MATCH ====================
    let sent = 0;
    let skippedCount = 0;
    let errors = 0;

    for (const match of pendingMatches) {
      try {
        const scoreHome = match.score_home as number;
        const scoreAway = match.score_away as number;

        // Skip excluded competitions
        if (EXCLUDED_COMPETITIONS.includes(match.competition)) {
          console.log(`Match ${match.id}: excluded competition ${match.competition} - skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats', match_id: match.id, action: 'skipped',
            reason: `Excluded competition: ${match.competition}`,
          });
          skippedCount++;
          continue;
        }

        // Check for draw
        if (scoreHome === scoreAway) {
          console.log(`Match ${match.id}: draw ${scoreHome}-${scoreAway} - skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats', match_id: match.id, action: 'skipped',
            reason: `Draw: ${scoreHome}-${scoreAway}`,
          });
          skippedCount++;
          continue;
        }

        // Determine winner
        const winnerIsHome = scoreHome > scoreAway;
        const winningTeamRaw = winnerIsHome ? match.home_team : match.away_team;
        const losingTeamRaw = winnerIsHome ? match.away_team : match.home_team;

        // Resolve canonical name
        const winningCanonical = findCanonicalTeam(winningTeamRaw);
        if (!winningCanonical) {
          console.log(`Match ${match.id}: winning team "${winningTeamRaw}" has no canonical mapping - skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats', match_id: match.id, action: 'skipped',
            reason: `No canonical mapping for winning team: ${winningTeamRaw}`,
          });
          skippedCount++;
          continue;
        }

        // Check if winning team is featured
        if (!featuredTeamNames.includes(winningCanonical)) {
          console.log(`Match ${match.id}: winning team "${winningCanonical}" is not featured - skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats', match_id: match.id, action: 'skipped',
            reason: `Winning team not featured: ${winningCanonical}`,
          });
          skippedCount++;
          continue;
        }

        // Get Braze attribute value for targeting
        const winningBrazeValue = brazeAttributeMap.get(winningCanonical) || winningCanonical;

        // Get Arabic translations
        const home_ar = await ensureTeamTranslation(match.home_team);
        const away_ar = await ensureTeamTranslation(match.away_team);
        const winning_ar = winnerIsHome ? home_ar : away_ar;
        const losing_ar = winnerIsHome ? away_ar : home_ar;

        if (!home_ar || !away_ar) {
          console.error(`Match ${match.id}: missing Arabic translations - skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats', match_id: match.id, action: 'skipped',
            reason: 'Arabic translation unavailable',
          });
          skippedCount++;
          continue;
        }

        // Reserve slot in congrats_ledger (UNIQUE constraint prevents double-sends)
        const { error: ledgerError } = await supabase.from('congrats_ledger').insert({
          match_id: match.id,
          winning_team: winningCanonical,
          losing_team: losingTeamRaw,
          score_home: scoreHome,
          score_away: scoreAway,
          status: 'sent',
        });

        if (ledgerError) {
          if (ledgerError.code === '23505') {
            console.log(`Match ${match.id}: already in congrats_ledger (duplicate prevented)`);
            await supabase.from('matches').update({ congrats_status: 'sent' }).eq('id', match.id);
            skippedCount++;
            continue;
          }
          throw ledgerError;
        }

        // Build audience: fans of the winning team
        const audience = {
          OR: [
            { custom_attribute: { custom_attribute_name: 'Team 1', comparison: 'equals', value: winningBrazeValue } },
            { custom_attribute: { custom_attribute_name: 'Team 2', comparison: 'equals', value: winningBrazeValue } },
            { custom_attribute: { custom_attribute_name: 'Team 3', comparison: 'equals', value: winningBrazeValue } },
          ],
        };

        // Competition translations
        const competition_en = compEnglishMap.get(match.competition) || match.competition_name || match.competition;
        const competition_ar = compArabicMap.get(match.competition) || competition_en;

        // Call Braze Campaign API
        const brazePayload = {
          campaign_id: brazeCampaignId,
          broadcast: false,
          audience,
          trigger_properties: {
            match_id: String(match.id),
            winning_team_en: winningCanonical,
            winning_team_ar: winning_ar,
            losing_team_en: losingTeamRaw,
            losing_team_ar: losing_ar,
            score_home: scoreHome,
            score_away: scoreAway,
            home_en: match.home_team,
            away_en: match.away_team,
            home_ar,
            away_ar,
            competition_en,
            competition_ar,
            result_summary: `${scoreHome}-${scoreAway}`,
          },
        };

        console.log(`🚀 Sending congrats for match ${match.id}: ${winningCanonical} wins ${scoreHome}-${scoreAway}`);

        const brazeResponse = await fetch(`${brazeEndpoint}/campaigns/trigger/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${brazeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(brazePayload),
        });

        const brazeResult = await brazeResponse.json();

        if (!brazeResponse.ok) {
          console.error(`❌ Braze API error for match ${match.id}:`, brazeResult);
          await supabase.from('congrats_ledger').update({ status: 'error' }).eq('match_id', match.id);
          await supabase.from('matches').update({ congrats_status: 'error' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats', match_id: match.id, action: 'error',
            reason: `Braze API error: ${brazeResponse.status}`,
            details: { braze_response: brazeResult },
          });
          errors++;
          continue;
        }

        // Update congrats_ledger with dispatch_id
        const dispatchId = brazeResult.dispatch_id || null;
        await supabase.from('congrats_ledger').update({ braze_dispatch_id: dispatchId }).eq('match_id', match.id);

        // Mark match as sent
        await supabase.from('matches').update({ congrats_status: 'sent' }).eq('id', match.id);

        // Log success
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-congrats', match_id: match.id, action: 'congrats_sent',
          reason: `Congrats sent: ${winningCanonical} wins ${scoreHome}-${scoreAway}`,
          details: {
            winning_team: winningCanonical,
            losing_team: losingTeamRaw,
            score: `${scoreHome}-${scoreAway}`,
            dispatch_id: dispatchId,
            braze_attribute_value: winningBrazeValue,
          },
        });

        sent++;
        console.log(`✅ Match ${match.id}: congrats sent successfully (dispatch: ${dispatchId})`);

      } catch (matchError) {
        console.error(`❌ Error processing match ${match.id}:`, matchError);
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-congrats', match_id: match.id, action: 'error',
          reason: matchError instanceof Error ? matchError.message : 'Unknown error',
        });
        errors++;
      }
    }

    console.log(`📊 Congrats summary: ${sent} sent, ${skippedCount} skipped, ${errors} errors`);

    return new Response(
      JSON.stringify({ success: true, processed: pendingMatches.length, sent, skipped: skippedCount, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ braze-congrats error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    // Release lock
    if (lockAcquired) {
      await supabase.from('scheduler_locks').update({
        locked_at: null, locked_by: null, expires_at: null,
      }).eq('lock_name', 'braze-congrats').eq('locked_by', lockId);
      console.log(`🔓 Lock released: ${lockId}`);
    }
  }
});
