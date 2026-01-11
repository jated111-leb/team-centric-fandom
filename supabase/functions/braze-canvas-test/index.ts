import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { formatInTimeZone, toZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const brazeApiKey = Deno.env.get('BRAZE_API_KEY');
    const brazeEndpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    const brazeCanvasId = Deno.env.get('BRAZE_CANVAS_ID');

    if (!brazeApiKey || !brazeEndpoint || !brazeCanvasId) {
      throw new Error('Missing Braze configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse parameters
    let testUserId = '874810';
    let matchId: number | null = null;
    let mode: 'immediate' | 'scheduled' = 'immediate';
    let waitForWebhook = false;
    let webhookTimeoutSeconds = 30;
    let scheduleDelayMinutes = 2; // For scheduled mode, how far in the future

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.user_id) testUserId = String(body.user_id);
      if (body.match_id) matchId = Number(body.match_id);
      if (body.mode === 'scheduled') mode = 'scheduled';
      if (body.wait_for_webhook === true) waitForWebhook = true;
      if (body.webhook_timeout_seconds) webhookTimeoutSeconds = Math.min(60, Math.max(5, Number(body.webhook_timeout_seconds)));
      if (body.schedule_delay_minutes) scheduleDelayMinutes = Math.min(30, Math.max(1, Number(body.schedule_delay_minutes)));
    }

    // Get a real upcoming match if no match_id specified
    let match;
    if (matchId) {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();
      if (error) throw new Error(`Match not found: ${matchId}`);
      match = data;
    } else {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .gte('utc_date', new Date().toISOString())
        .order('utc_date', { ascending: true })
        .limit(1)
        .single();
      if (error) throw new Error('No upcoming matches found');
      match = data;
    }

    // Get Arabic translations
    const { data: translations } = await supabase
      .from('team_translations')
      .select('team_name, arabic_name')
      .in('team_name', [match.home_team, match.away_team]);

    const translationMap = new Map(
      (translations || []).map(t => [t.team_name, t.arabic_name])
    );

    const homeTeamAr = translationMap.get(match.home_team) || match.home_team;
    const awayTeamAr = translationMap.get(match.away_team) || match.away_team;

    // Get competition translation
    const { data: compTranslation } = await supabase
      .from('competition_translations')
      .select('arabic_name')
      .eq('competition_code', match.competition)
      .single();

    const competitionAr = compTranslation?.arabic_name || match.competition_name;

    // Prepare canvas entry properties
    const kickoffDate = new Date(match.utc_date);
    const BAGHDAD_TIMEZONE = 'Asia/Baghdad';
    const baghdadTime = toZonedTime(kickoffDate, BAGHDAD_TIMEZONE);

    // Helper to convert digits to Arabic numerals
    const toArabicDigits = (str: string) => {
      const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      return str.replace(/\d/g, (d) => arabicDigits[parseInt(d)]);
    };

    // kickoff_ar: "الساعة ٨:٠٠ م ٢٥-١١-٢٠٢٥ (توقيت بغداد)"
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

    const kickoff_baghdad = formatInTimeZone(kickoffDate, BAGHDAD_TIMEZONE, 'yyyy-MM-dd HH:mm');

    const testSignature = `test-${match.id}-${Date.now()}`;
    const canvasEntryProperties = {
      // Scheduler keys
      match_id: match.id.toString(),
      competition_key: match.competition,
      competition_en: match.competition_name,
      competition_ar: competitionAr,
      home_en: match.home_team,
      away_en: match.away_team,
      home_ar: homeTeamAr,
      away_ar: awayTeamAr,
      kickoff_utc: match.utc_date,
      kickoff_baghdad,
      kickoff_ar,
      sig: testSignature,

      // Backwards-compatible aliases
      home_team: match.home_team,
      away_team: match.away_team,
      home_team_ar: homeTeamAr,
      away_team_ar: awayTeamAr,
      competition: match.competition_name,
      match_date: match.match_date,
      match_time: match.match_time,
    };

    console.log(`🧪 Test mode: ${mode}`);
    console.log('Sending test Canvas to user:', testUserId);
    console.log('Match:', match.id, match.home_team, 'vs', match.away_team);

    let brazeResult: any;
    let scheduleId: string | null = null;
    let scheduledSendTime: string | null = null;

    if (mode === 'immediate') {
      // Immediate send with recipients array for single user test
      const requestBody = {
        canvas_id: brazeCanvasId,
        recipients: [
          { external_user_id: testUserId }
        ],
        canvas_entry_properties: canvasEntryProperties,
      };
      
      const fullUrl = `${brazeEndpoint}/canvas/trigger/send`;
      console.log('Sending immediate test to:', fullUrl);
      
      const brazeResponse = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${brazeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      brazeResult = await brazeResponse.json();
      console.log('Braze response:', JSON.stringify(brazeResult));

    } else {
      // Scheduled send - create a schedule for X minutes in the future
      scheduledSendTime = new Date(Date.now() + scheduleDelayMinutes * 60 * 1000).toISOString();
      
      const requestBody = {
        canvas_id: brazeCanvasId,
        recipients: [
          { external_user_id: testUserId }
        ],
        canvas_entry_properties: canvasEntryProperties,
        schedule: {
          time: scheduledSendTime,
        },
      };
      
      const fullUrl = `${brazeEndpoint}/canvas/trigger/schedule/create`;
      console.log('Creating scheduled test for:', scheduledSendTime);
      console.log('Sending to:', fullUrl);
      
      const brazeResponse = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${brazeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      brazeResult = await brazeResponse.json();
      scheduleId = brazeResult.schedule_id || null;
      console.log('Braze response:', JSON.stringify(brazeResult));
    }

    const brazeSendSuccess = brazeResult.message === 'success';

    // Log the test send
    await supabase.from('scheduler_logs').insert({
      function_name: 'braze-canvas-test',
      action: mode === 'immediate' ? 'test_send_immediate' : 'test_send_scheduled',
      match_id: match.id,
      details: {
        user_id: testUserId,
        canvas_id: brazeCanvasId,
        mode,
        schedule_id: scheduleId,
        scheduled_send_time: scheduledSendTime,
        braze_response: brazeResult,
        test_signature: testSignature,
      },
    });

    // Wait for webhook verification if requested (only for immediate sends)
    let webhookVerified = false;
    let webhookDetails: any = null;

    if (waitForWebhook && brazeSendSuccess && mode === 'immediate') {
      console.log(`⏳ Waiting up to ${webhookTimeoutSeconds}s for webhook confirmation...`);
      
      const startTime = Date.now();
      const pollInterval = 2000; // Check every 2 seconds
      
      while (Date.now() - startTime < webhookTimeoutSeconds * 1000) {
        // Check notification_sends for a record matching our test
        const { data: webhookRecord, error: webhookError } = await supabase
          .from('notification_sends')
          .select('*')
          .eq('match_id', match.id)
          .eq('external_user_id', testUserId)
          .gte('sent_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
          .order('sent_at', { ascending: false })
          .limit(1);

        if (!webhookError && webhookRecord && webhookRecord.length > 0) {
          webhookVerified = true;
          webhookDetails = {
            notification_id: webhookRecord[0].id,
            event_type: webhookRecord[0].braze_event_type,
            received_at: webhookRecord[0].created_at,
            latency_ms: Date.now() - startTime,
          };
          console.log(`✅ Webhook confirmed after ${webhookDetails.latency_ms}ms`);
          break;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      if (!webhookVerified) {
        console.log(`⚠️ No webhook received within ${webhookTimeoutSeconds}s timeout`);
      }
    }

    const response: any = {
      success: brazeSendSuccess,
      mode,
      user_id: testUserId,
      match: {
        id: match.id,
        home_team: match.home_team,
        away_team: match.away_team,
        kickoff: match.utc_date,
      },
      braze_response: brazeResult,
    };

    if (mode === 'scheduled') {
      response.schedule_id = scheduleId;
      response.scheduled_send_time = scheduledSendTime;
    }

    if (waitForWebhook && mode === 'immediate') {
      response.webhook_verified = webhookVerified;
      response.webhook_details = webhookDetails;
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in braze-canvas-test:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
