import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // Validate match exists and is still in the future
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

    const kickoffUtc = new Date(match.utc_date);
    const now = new Date();

    if (kickoffUtc <= now) {
      return new Response(
        JSON.stringify({ error: 'Cannot set a reminder for a past or in-play match' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
