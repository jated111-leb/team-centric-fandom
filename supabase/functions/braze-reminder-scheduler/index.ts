import { createClient } from 'npm:@supabase/supabase-js@2';
import { formatInTimeZone } from 'npm:date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEND_OFFSET_MINUTES = 30;   // Notify 30 min before kickoff
const UPDATE_BUFFER_MINUTES = 10; // Don't reschedule within 10 min of the current send_at
const LOCK_TIMEOUT_MINUTES = 10;
const STALE_CANCELLED_DAYS = 30;  // Delete cancelled rows older than this
const BAGHDAD_TIMEZONE = 'Asia/Baghdad';

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
      const { data: roleData } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
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
      .eq('flag_name', 'reminder_notifications_enabled')
      .single();

    if (!flag?.enabled) {
      console.log('🚫 reminder_notifications_enabled flag is disabled - skipping');
      return new Response(JSON.stringify({ message: 'Feature disabled', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ==================== LOCK ====================
    const lockExpiry = new Date(Date.now() + LOCK_TIMEOUT_MINUTES * 60 * 1000).toISOString();
    const lockCheckTime = new Date();

    const { data: currentLock } = await supabase
      .from('scheduler_locks')
      .select('locked_at, locked_by, expires_at')
      .eq('lock_name', 'braze-reminder-scheduler')
      .maybeSingle();

    const canAcquire =
      !currentLock?.locked_at ||
      !currentLock?.expires_at ||
      new Date(currentLock.expires_at) < lockCheckTime;

    if (!canAcquire) {
      console.log('Another braze-reminder-scheduler process is running - skipping');
      return new Response(JSON.stringify({ message: 'Already running', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('scheduler_locks').update({
      locked_at: lockCheckTime.toISOString(),
      locked_by: lockId,
      expires_at: lockExpiry,
    }).eq('lock_name', 'braze-reminder-scheduler');

    lockAcquired = true;
    console.log(`🔒 Lock acquired: ${lockId}`);

    // ==================== BRAZE CONFIG ====================
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCampaignId = Deno.env.get('BRAZE_REMINDER_CAMPAIGN_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCampaignId) {
      throw new Error(
        'Missing Braze reminder configuration (BRAZE_API_KEY, BRAZE_REST_ENDPOINT, or BRAZE_REMINDER_CAMPAIGN_ID)'
      );
    }

    // ==================== LOAD TRANSLATIONS ====================
    const [{ data: teamTranslations }, { data: compTranslations }] = await Promise.all([
      supabase.from('team_translations').select('*'),
      supabase.from('competition_translations').select('*'),
    ]);

    const teamArabicMap = new Map(
      (teamTranslations || []).map((t) => [t.team_name, t.arabic_name])
    );
    const compArabicMap = new Map(
      (compTranslations || []).map((c) => [c.competition_code, c.arabic_name])
    );
    const compEnglishMap = new Map(
      (compTranslations || []).map((c) => [c.competition_code, c.english_name])
    );

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
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content:
                  'You are a sports translator specializing in football team names. Translate the given football team name to Arabic. Return ONLY the Arabic translation, nothing else. Use the commonly recognized Arabic name for the team.',
              },
              {
                role: 'user',
                content: `Translate this football team name to Arabic: ${teamName}`,
              },
            ],
          }),
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.error(`AI translation failed for ${teamName}: ${response.status}`);
          return null;
        }
        const data = await response.json();
        const arabicName = data.choices[0].message.content.trim();
        await supabase
          .from('team_translations')
          .insert({ team_name: teamName, arabic_name: arabicName })
          .select()
          .single();
        teamArabicMap.set(teamName, arabicName);
        console.log(`✅ Saved Arabic translation: ${teamName} → ${arabicName}`);
        return arabicName;
      } catch (error) {
        console.error(`Error generating translation for ${teamName}:`, error);
        return null;
      }
    }

    // ==================== FETCH PENDING REMINDERS ====================
    const now = new Date();

    const { data: reminders, error: remindersError } = await supabase
      .from('game_reminders')
      .select(`
        id,
        external_user_id,
        match_id,
        reminder_status,
        braze_schedule_id,
        scheduled_send_at,
        kickoff_utc,
        matches (
          id,
          utc_date,
          home_team,
          away_team,
          competition,
          competition_name,
          status
        )
      `)
      .in('reminder_status', ['pending', 'scheduled']);

    if (remindersError) throw remindersError;

    if (!reminders || reminders.length === 0) {
      console.log('📭 No pending reminders found');
      return new Response(
        JSON.stringify({ message: 'No pending reminders', processed: 0, scheduled: 0, updated: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${reminders.length} reminders across matches`);

    // ==================== GROUP BY MATCH ====================
    // Processing per-match (not per-reminder) reduces Braze API calls from O(users)
    // to O(matches) — all users for the same match are sent in a single Braze API call.
    const byMatch = new Map<number, typeof reminders>();
    for (const r of reminders) {
      if (!byMatch.has(r.match_id)) byMatch.set(r.match_id, []);
      byMatch.get(r.match_id)!.push(r);
    }

    console.log(`📋 ${byMatch.size} distinct matches to process`);

    let scheduled = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // ==================== PROCESS EACH MATCH GROUP ====================
    for (const [matchId, group] of byMatch) {
      const allIds = group.map((r) => r.id);
      const match = group[0].matches as any;

      try {
        if (!match) {
          console.error(`Match ${matchId}: match data missing for ${group.length} reminders`);
          errors += group.length;
          continue;
        }

        // Cancel the whole group if match is no longer upcoming
        if (['FINISHED', 'CANCELLED', 'POSTPONED'].includes(match.status)) {
          console.log(`Match ${matchId}: status=${match.status} — cancelling ${group.length} reminders`);
          await supabase
            .from('game_reminders')
            .update({ reminder_status: 'cancelled', updated_at: now.toISOString() })
            .in('id', allIds);
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-reminder-scheduler',
            match_id: matchId,
            action: 'reminder_cancelled',
            reason: `Match status: ${match.status}`,
            details: { reminder_count: group.length },
          });
          skipped += group.length;
          continue;
        }

        const kickoffUtc = new Date(match.utc_date);
        const sendAt = new Date(kickoffUtc.getTime() - SEND_OFFSET_MINUTES * 60 * 1000);

        // Cancel the whole group if the send window has passed
        if (sendAt <= new Date(now.getTime() + 5 * 60 * 1000)) {
          console.log(`Match ${matchId}: send window missed (send_at=${sendAt.toISOString()}) — cancelling ${group.length} reminders`);
          await supabase
            .from('game_reminders')
            .update({ reminder_status: 'cancelled', updated_at: now.toISOString() })
            .in('id', allIds);
          skipped += group.length;
          continue;
        }

        const pendingGroup = group.filter((r) => r.reminder_status === 'pending');
        const scheduledGroup = group.filter((r) => r.reminder_status === 'scheduled');

        // Drift: any scheduled reminder whose stored kickoff differs from the current match time
        const kickoffChanged = scheduledGroup.some(
          (r) => r.kickoff_utc && new Date(r.kickoff_utc).getTime() !== kickoffUtc.getTime()
        );

        // CASE 1: No pending reminders and no drift → nothing to do
        if (pendingGroup.length === 0 && !kickoffChanged) {
          console.log(`Match ${matchId}: ${scheduledGroup.length} scheduled, kickoff unchanged — skipping`);
          skipped += group.length;
          continue;
        }

        // Get Arabic translations once per match (cached across matches in teamArabicMap)
        const home_ar = await ensureTeamTranslation(match.home_team);
        const away_ar = await ensureTeamTranslation(match.away_team);

        if (!home_ar || !away_ar) {
          console.error(`Match ${matchId}: missing Arabic translations — skipping ${group.length} reminders`);
          skipped += group.length;
          continue;
        }

        const competition_en =
          compEnglishMap.get(match.competition) || match.competition_name || match.competition;
        const competition_ar = compArabicMap.get(match.competition) || competition_en;
        const game_day = formatInTimeZone(kickoffUtc, BAGHDAD_TIMEZONE, 'yyyy-MM-dd');
        const game_time_baghdad = formatInTimeZone(kickoffUtc, BAGHDAD_TIMEZONE, 'HH:mm');

        const triggerProperties = {
          match_id: String(matchId),
          team_1_en: match.home_team,
          team_2_en: match.away_team,
          team_1_ar: home_ar,
          team_2_ar: away_ar,
          game_day,
          game_time_baghdad,
          competition_en,
          competition_ar,
          kickoff_utc: kickoffUtc.toISOString(),
        };

        // CASE 2: Kickoff time drifted on already-scheduled reminders
        // Delete all existing Braze scheduled sends for this match and recreate with fresh
        // trigger_properties and the new send_at. This also consolidates multiple schedule IDs
        // (from different scheduler runs) into a single one.
        if (kickoffChanged) {
          const minutesToSend = (sendAt.getTime() - now.getTime()) / 60000;
          if (minutesToSend < UPDATE_BUFFER_MINUTES) {
            console.log(
              `Match ${matchId}: within update buffer (${minutesToSend.toFixed(1)} min) — skipping`
            );
            skipped += group.length;
            continue;
          }

          // All users in the group (pending + scheduled) get the new schedule
          const recipients = group.map((r) => ({ external_user_id: r.external_user_id }));

          // Delete each distinct Braze schedule ID that was previously created for this match
          const distinctScheduleIds = [
            ...new Set(scheduledGroup.map((r) => r.braze_schedule_id).filter(Boolean)),
          ];
          for (const schedId of distinctScheduleIds) {
            const delRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/delete`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${brazeApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ campaign_id: brazeCampaignId, schedule_id: schedId }),
            });
            if (!delRes.ok) {
              // Non-fatal: log and continue. The old send may fire at the wrong time,
              // but the new create below will still send at the correct time.
              console.warn(
                `Match ${matchId}: Braze delete failed for schedule ${schedId} (${delRes.status}) — continuing`
              );
            }
          }

          // Create new schedule for all users in the group with fresh trigger_properties
          console.log(
            `🔄 Recreating Braze schedule for match ${matchId}: ${recipients.length} users, send_at=${sendAt.toISOString()}`
          );
          const createRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/create`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${brazeApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              campaign_id: brazeCampaignId,
              schedule: { time: sendAt.toISOString() },
              recipients,
              trigger_properties: triggerProperties,
            }),
          });

          const createResult = await createRes.json();

          if (!createRes.ok) {
            console.error(`❌ Braze create (drift) failed for match ${matchId}:`, createResult);
            await supabase.from('scheduler_logs').insert({
              function_name: 'braze-reminder-scheduler',
              match_id: matchId,
              action: 'error',
              reason: `Braze schedule create (drift) failed: ${createRes.status}`,
              details: { reminder_count: group.length, braze_response: createResult },
            });
            errors += group.length;
            continue;
          }

          const newScheduleId = createResult.schedule_id || createResult.dispatch_id || null;

          await supabase
            .from('game_reminders')
            .update({
              reminder_status: 'scheduled',
              braze_schedule_id: newScheduleId,
              scheduled_send_at: sendAt.toISOString(),
              kickoff_utc: kickoffUtc.toISOString(),
              updated_at: now.toISOString(),
            })
            .in('id', allIds);

          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-reminder-scheduler',
            match_id: matchId,
            action: 'reminder_updated',
            reason: 'Kickoff time changed — Braze schedule recreated with fresh trigger_properties',
            details: {
              reminder_count: group.length,
              new_send_at: sendAt.toISOString(),
              new_schedule_id: newScheduleId,
              deleted_schedule_ids: distinctScheduleIds,
            },
          });

          console.log(`✅ Match ${matchId}: ${group.length} reminders rescheduled (Braze ID: ${newScheduleId})`);
          updated += group.length;
          continue;
        }

        // CASE 3: New pending reminders (no drift on existing scheduled ones)
        // Create one Braze scheduled send for all pending users in this match.
        // Scheduled reminders in this group already have a valid Braze send — leave them alone.
        const recipients = pendingGroup.map((r) => ({ external_user_id: r.external_user_id }));

        console.log(
          `📅 Creating Braze schedule for match ${matchId}: ${recipients.length} users, send_at=${sendAt.toISOString()}`
        );

        const createRes = await fetch(`${brazeEndpoint}/campaigns/trigger/schedule/create`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${brazeApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            campaign_id: brazeCampaignId,
            schedule: { time: sendAt.toISOString() },
            recipients,
            trigger_properties: triggerProperties,
          }),
        });

        const createResult = await createRes.json();

        if (!createRes.ok) {
          console.error(`❌ Braze create failed for match ${matchId}:`, createResult);
          await supabase
            .from('game_reminders')
            .update({ reminder_status: 'error', updated_at: now.toISOString() })
            .in('id', pendingGroup.map((r) => r.id));
          await supabase.from('scheduler_logs').insert({
            function_name: 'braze-reminder-scheduler',
            match_id: matchId,
            action: 'error',
            reason: `Braze schedule create failed: ${createRes.status}`,
            details: { reminder_count: pendingGroup.length, braze_response: createResult },
          });
          errors += pendingGroup.length;
          skipped += scheduledGroup.length;
          continue;
        }

        const brazeScheduleId = createResult.schedule_id || createResult.dispatch_id || null;

        await supabase
          .from('game_reminders')
          .update({
            reminder_status: 'scheduled',
            braze_schedule_id: brazeScheduleId,
            scheduled_send_at: sendAt.toISOString(),
            kickoff_utc: kickoffUtc.toISOString(),
            updated_at: now.toISOString(),
          })
          .in('id', pendingGroup.map((r) => r.id));

        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-reminder-scheduler',
          match_id: matchId,
          action: 'reminder_scheduled',
          reason: `${pendingGroup.length} reminder(s) scheduled ${SEND_OFFSET_MINUTES} min before kickoff`,
          details: {
            reminder_count: pendingGroup.length,
            braze_schedule_id: brazeScheduleId,
            send_at: sendAt.toISOString(),
            team_1: match.home_team,
            team_2: match.away_team,
          },
        });

        console.log(
          `✅ Match ${matchId}: ${pendingGroup.length} reminder(s) scheduled for ${sendAt.toISOString()} (Braze ID: ${brazeScheduleId})`
        );
        scheduled += pendingGroup.length;
        skipped += scheduledGroup.length; // already scheduled, no drift
      } catch (matchError) {
        console.error(`❌ Error processing match ${matchId}:`, matchError);
        await supabase.from('scheduler_logs').insert({
          function_name: 'braze-reminder-scheduler',
          match_id: matchId,
          action: 'error',
          reason: matchError instanceof Error ? matchError.message : 'Unknown error',
          details: { reminder_count: group.length },
        });
        errors += group.length;
      }
    }

    // ==================== CLEANUP STALE CANCELLED ROWS ====================
    // Cancelled rows accumulate over time. Remove ones older than STALE_CANCELLED_DAYS
    // to keep the table lean. Active rows (pending/scheduled) are never touched here.
    const staleThreshold = new Date(
      now.getTime() - STALE_CANCELLED_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: deletedCount } = await supabase
      .from('game_reminders')
      .delete({ count: 'exact' })
      .eq('reminder_status', 'cancelled')
      .lt('updated_at', staleThreshold);

    if (deletedCount && deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} stale cancelled reminder row(s)`);
    }

    console.log(
      `📊 Reminder summary: ${scheduled} scheduled, ${updated} updated, ${skipped} skipped, ${errors} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: reminders.length,
        scheduled,
        updated,
        skipped,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ braze-reminder-scheduler error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (lockAcquired) {
      await supabase
        .from('scheduler_locks')
        .update({ locked_at: null, locked_by: null, expires_at: null })
        .eq('lock_name', 'braze-reminder-scheduler')
        .eq('locked_by', lockId);
      console.log(`🔓 Lock released: ${lockId}`);
    }
  }
});
