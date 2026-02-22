import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCK_TIMEOUT_MINUTES = 10;

// Competitions without streaming rights — same exclusions as pre-match
const EXCLUDED_COMPETITIONS = ['FL1', 'DED', 'EL', 'ECL'];

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
    // ==================== LOCK ====================
    const lockExpiry = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    const lockCheckTime = new Date();

    const { data: currentLock } = await supabase
      .from('scheduler_locks')
      .select('locked_at, locked_by, expires_at')
      .eq('lock_name', 'braze-congrats')
      .maybeSingle();

    const canAcquire =
      !currentLock?.locked_at ||
      !currentLock?.expires_at ||
      new Date(currentLock.expires_at) < lockCheckTime;

    if (!canAcquire) {
      console.log(`Another braze-congrats process is running — skipping`);
      return new Response(
        JSON.stringify({ message: 'Already running', sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabase
      .from('scheduler_locks')
      .update({ locked_at: lockCheckTime.toISOString(), locked_by: lockId, expires_at: lockExpiry })
      .eq('lock_name', 'braze-congrats');

    lockAcquired = true;
    console.log(`Lock acquired: ${lockId}`);

    // ==================== FEATURE FLAG ====================
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('flag_name', 'congrats_notifications_enabled')
      .single();

    if (!flag?.enabled) {
      console.log('Feature flag disabled — skipping congrats scheduler');
      return new Response(
        JSON.stringify({ message: 'Feature disabled', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== CONFIG ====================
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_CONGRATS_CAMPAIGN_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
      throw new Error('Missing Braze congrats configuration (BRAZE_API_KEY, BRAZE_REST_ENDPOINT, or BRAZE_CONGRATS_CAMPAIGN_ID)');
    }

    // ==================== FETCH PENDING FINISHED MATCHES ====================
    const { data: pendingMatches, error: matchError } = await supabase
      .from('matches')
      .select('*')
      .eq('status', 'FINISHED')
      .eq('congrats_status', 'pending')
      .not('score_home', 'is', null)
      .not('score_away', 'is', null)
      .order('utc_date', { ascending: true });

    if (matchError) throw matchError;

    const matches = (pendingMatches || []).filter(
      m => !EXCLUDED_COMPETITIONS.includes(m.competition)
    );

    console.log(`Found ${pendingMatches?.length || 0} pending finished matches, ${matches.length} after competition filter`);

    if (matches.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending matches', sent: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== LOAD TEAM CONFIG ====================
    const { data: featuredTeamsData } = await supabase
      .from('featured_teams')
      .select('team_name, braze_attribute_value');

    const featuredTeamNames = (featuredTeamsData || []).map(t => t.team_name);
    const brazeAttributeMap = new Map(
      (featuredTeamsData || []).map(t => [t.team_name, t.braze_attribute_value || t.team_name])
    );

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

    // ==================== LOAD TRANSLATIONS ====================
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

    // Translation helper (reuses Lovable AI pattern from braze-scheduler)
    async function ensureTeamTranslation(teamName: string): Promise<string | null> {
      if (teamArabicMap.has(teamName)) {
        return teamArabicMap.get(teamName)!;
      }

      console.log(`Generating Arabic translation for: ${teamName}`);
      try {
        const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

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
              { role: 'system', content: 'You are a sports translator specializing in football team names. Translate the given football team name to Arabic. Return ONLY the Arabic translation, nothing else.' },
              { role: 'user', content: `Translate this football team name to Arabic: ${teamName}` }
            ],
          }),
        });

        clearTimeout(timeout);
        if (!response.ok) return null;

        const data = await response.json();
        const arabicName = data.choices[0].message.content.trim();

        await supabase
          .from('team_translations')
          .insert({ team_name: teamName, arabic_name: arabicName })
          .select()
          .single();

        teamArabicMap.set(teamName, arabicName);
        return arabicName;
      } catch {
        return null;
      }
    }

    // ==================== PROCESS EACH MATCH ====================
    let sent = 0;
    let skipped = 0;

    for (const match of matches) {
      try {
        console.log(`Processing match ${match.id}: ${match.home_team} ${match.score_home}-${match.score_away} ${match.away_team}`);

        // Determine winner
        if (match.score_home === match.score_away) {
          console.log(`Match ${match.id}: draw — skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats',
            match_id: match.id,
            action: 'skipped',
            reason: 'Draw — no congrats notification',
            details: { score_home: match.score_home, score_away: match.score_away },
          });
          skipped++;
          continue;
        }

        const homeWins = match.score_home > match.score_away;
        const winningTeamRaw = homeWins ? match.home_team : match.away_team;
        const losingTeamRaw = homeWins ? match.away_team : match.home_team;

        // Resolve to canonical name
        const winningCanonical = findCanonicalTeam(winningTeamRaw);

        if (!winningCanonical || !featuredTeamNames.includes(winningCanonical)) {
          console.log(`Match ${match.id}: winning team "${winningTeamRaw}" (canonical: ${winningCanonical || 'unmapped'}) not in featured teams — skipping`);
          await supabase.from('matches').update({ congrats_status: 'skipped' }).eq('id', match.id);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats',
            match_id: match.id,
            action: 'skipped',
            reason: 'Winning team not featured',
            details: { winning_team: winningTeamRaw, canonical: winningCanonical },
          });
          skipped++;
          continue;
        }

        // Get Braze attribute value for audience targeting
        const winningBrazeValue = brazeAttributeMap.get(winningCanonical) || winningCanonical;

        // Get translations
        const homeAr = await ensureTeamTranslation(match.home_team);
        const awayAr = await ensureTeamTranslation(match.away_team);

        if (!homeAr || !awayAr) {
          console.error(`Match ${match.id}: translation unavailable — skipping`);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats',
            match_id: match.id,
            action: 'skipped',
            reason: 'Translation unavailable',
            details: { home_ar: !!homeAr, away_ar: !!awayAr },
          });
          skipped++;
          continue;
        }

        const winningAr = homeWins ? homeAr : awayAr;
        const losingAr = homeWins ? awayAr : homeAr;

        // Reserve slot in congrats_ledger (UNIQUE on match_id prevents double-sends)
        const { error: ledgerError } = await supabase
          .from('congrats_ledger')
          .insert({
            match_id: match.id,
            winning_team: winningCanonical,
            losing_team: losingTeamRaw,
            score_home: match.score_home,
            score_away: match.score_away,
            status: 'sent',
          });

        if (ledgerError) {
          if (ledgerError.code === '23505') {
            console.log(`Match ${match.id}: already in congrats_ledger — skipping`);
            await supabase.from('matches').update({ congrats_status: 'sent' }).eq('id', match.id);
            skipped++;
            continue;
          }
          throw ledgerError;
        }

        // Build audience: fans of winning team
        const audience = {
          OR: [
            { custom_attribute: { custom_attribute_name: 'Team 1', comparison: 'equals', value: winningBrazeValue } },
            { custom_attribute: { custom_attribute_name: 'Team 2', comparison: 'equals', value: winningBrazeValue } },
            { custom_attribute: { custom_attribute_name: 'Team 3', comparison: 'equals', value: winningBrazeValue } },
          ]
        };

        // Build trigger properties
        const triggerProps = {
          match_id: match.id.toString(),
          winning_team_en: winningCanonical,
          winning_team_ar: winningAr,
          losing_team_en: losingTeamRaw,
          losing_team_ar: losingAr,
          score_home: match.score_home,
          score_away: match.score_away,
          home_en: match.home_team,
          away_en: match.away_team,
          home_ar: homeAr,
          away_ar: awayAr,
          competition_en: compEnglishMap.get(match.competition) || match.competition_name,
          competition_ar: compArabicMap.get(match.competition) || match.competition_name,
          result_summary: `${match.score_home}-${match.score_away}`,
        };

        // Send via Braze Campaign API (immediate)
        const brazeRes = await fetch(`${brazeEndpoint}/campaigns/trigger/send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${brazeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            campaign_id: brazeCampaignId,
            broadcast: true,
            audience,
            trigger_properties: triggerProps,
          }),
        });

        if (!brazeRes.ok) {
          const errorText = await brazeRes.text();
          console.error(`Match ${match.id}: Braze API error — ${errorText}`);

          // Update ledger status to error
          await supabase.from('congrats_ledger')
            .update({ status: 'error' })
            .eq('match_id', match.id);

          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-congrats',
            match_id: match.id,
            action: 'error',
            reason: 'Braze Campaign API failed',
            details: { error: errorText, status: brazeRes.status },
          });
          continue;
        }

        const brazeData = await brazeRes.json();

        // Update ledger with dispatch ID
        await supabase.from('congrats_ledger')
          .update({ braze_dispatch_id: brazeData.dispatch_id || null })
          .eq('match_id', match.id);

        // Mark match as sent
        await supabase.from('matches')
          .update({ congrats_status: 'sent' })
          .eq('id', match.id);

        console.log(`Match ${match.id}: congrats sent to ${winningCanonical} fans (dispatch: ${brazeData.dispatch_id})`);
        sent++;

        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-congrats',
          match_id: match.id,
          action: 'sent',
          reason: `Congrats sent to ${winningCanonical} fans`,
          details: {
            winning_team: winningCanonical,
            score: `${match.score_home}-${match.score_away}`,
            dispatch_id: brazeData.dispatch_id,
          },
        });

      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error);
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-congrats',
          match_id: match.id,
          action: 'error',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`Braze congrats complete: sent=${sent}, skipped=${skipped}`);

    await supabase.from('scheduler_logs').insert({
      function_name: 'braze-congrats',
      action: 'run_complete',
      reason: `Sent: ${sent}, Skipped: ${skipped}`,
      details: { total_pending: matches.length, sent, skipped },
    });

    return new Response(
      JSON.stringify({ sent, skipped }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in braze-congrats:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (lockAcquired) {
      await supabase
        .from('scheduler_locks')
        .update({ locked_at: null, locked_by: null, expires_at: null })
        .eq('lock_name', 'braze-congrats')
        .eq('locked_by', lockId);
      console.log(`Lock released: ${lockId}`);
    }
  }
});
