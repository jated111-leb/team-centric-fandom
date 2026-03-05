import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
};

const MAX_ACTIVE_REMINDERS_PER_USER = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ==================== AUTH ====================
  // APP_SECRET must be set in Edge Function secrets and sent by the mobile app
  // as the X-App-Secret header on every request.
  const appSecret = Deno.env.get('APP_SECRET');
  if (appSecret) {
    const clientSecret = req.headers.get('X-App-Secret');
    if (clientSecret !== appSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const { match_id, external_user_id } = body;

    if (!match_id || !external_user_id) {
      return new Response(
        JSON.stringify({ error: 'match_id and external_user_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate match exists and is available for reminders
    const { data: match, error: matchError } = await supabase
      .from('matches')
      .select('id, utc_date, home_team, away_team, status')
      .eq('id', Number(match_id))
      .maybeSingle();

    if (matchError) throw matchError;

    if (!match) {
      return new Response(
        JSON.stringify({ error: 'Match not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (['FINISHED', 'CANCELLED', 'POSTPONED'].includes(match.status)) {
      return new Response(
        JSON.stringify({ error: 'Match is not available for reminders' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const kickoffUtc = new Date(match.utc_date);
    const now = new Date();

    if (kickoffUtc <= now) {
      return new Response(
        JSON.stringify({ error: 'Cannot set a reminder for a past or in-play match' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cap: refuse if user already has MAX_ACTIVE_REMINDERS_PER_USER active reminders.
    // This prevents a compromised or abusive client from flooding the table.
    const { count, error: countError } = await supabase
      .from('game_reminders')
      .select('id', { count: 'exact', head: true })
      .eq('external_user_id', String(external_user_id))
      .in('reminder_status', ['pending', 'scheduled']);

    if (countError) throw countError;

    if ((count ?? 0) >= MAX_ACTIVE_REMINDERS_PER_USER) {
      return new Response(
        JSON.stringify({ error: `Maximum of ${MAX_ACTIVE_REMINDERS_PER_USER} active reminders allowed` }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert reminder — ON CONFLICT resets status to 'pending' so the scheduler picks it up again
    // (handles the case where a user re-taps "Remind Me" after a kickoff time change)
    const { data: reminder, error: upsertError } = await supabase
      .from('game_reminders')
      .upsert(
        {
          external_user_id: String(external_user_id),
          match_id: Number(match_id),
          reminder_status: 'pending',
          kickoff_utc: kickoffUtc.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: 'external_user_id,match_id' }
      )
      .select('id')
      .single();

    if (upsertError) throw upsertError;

    console.log(
      `✅ Reminder set: user=${external_user_id} match=${match_id} (${match.home_team} vs ${match.away_team})`
    );

    await supabase.from('scheduler_logs').insert({
      function_name: 'set-game-reminder',
      match_id: Number(match_id),
      action: 'reminder_set',
      reason: `Reminder set for user ${external_user_id}`,
      details: {
        external_user_id,
        reminder_id: reminder?.id,
        kickoff_utc: kickoffUtc.toISOString(),
      },
    });

    return new Response(
      JSON.stringify({ success: true, reminder_id: reminder?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ set-game-reminder error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
