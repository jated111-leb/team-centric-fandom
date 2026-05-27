// ============================================================================
// braze-worldcup-webhook  (PARITY-WITH-LEAGUE)
// ----------------------------------------------------------------------------
// Public endpoint (verify_jwt = false) that receives Braze delivery
// confirmations for the WC Canvas. Mirrors the league `braze-webhook`
// correlation strategy:
//   1. Look up ledger row by braze_send_id (preferred)
//   2. Fallback by braze_dispatch_id
//   3. Fallback time-window match (±10 min) on scheduled_send_at_utc plus
//      properties.match_id from canvas_entry_properties
// Persists canvas metadata + match_id into wc_notification_sends.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BrazeEvent {
  external_user_id?: string;
  user_id?: string;
  time?: number;
  event_type?: string;
  canvas_id?: string;
  canvas_name?: string;
  canvas_step_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  send_id?: string;
  dispatch_id?: string;
  properties?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Read raw body once so we can both verify the signature and parse JSON
  const rawBody = await req.text();

  // Optional but enforced when set: HMAC-SHA256 signature verification.
  // Set BRAZE_WEBHOOK_SECRET in env + configure the matching signing secret
  // in Braze's webhook settings to lock this endpoint down.
  const webhookSecret = Deno.env.get('BRAZE_WEBHOOK_SECRET');
  if (webhookSecret) {
    const provided = req.headers.get('X-Braze-Signature') ?? req.headers.get('x-braze-signature') ?? '';
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(webhookSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sigBytes = new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)),
      );
      const expectedHex = Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const expectedB64 = btoa(String.fromCharCode(...sigBytes));
      if (provided !== expectedHex && provided !== expectedB64) {
        return new Response(JSON.stringify({ error: 'invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      console.error('signature verify error:', e);
      return new Response(JSON.stringify({ error: 'signature verify failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const wcCanvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');
    const wcCongratsCampaignId = Deno.env.get('BRAZE_WC_CONGRATS_CAMPAIGN_ID');
    if (!wcCanvasId) throw new Error('Missing BRAZE_WC_CANVAS_ID');

    const payload = JSON.parse(rawBody);
    const events: BrazeEvent[] = payload.events ?? (Array.isArray(payload) ? payload : [payload]);

    let inserted = 0;
    let ignored = 0;

    for (const event of events) {
      // Determine notification type:
      //   - canvas events with matching canvas_id → pre_match
      //   - campaign events with matching congrats campaign_id → congrats
      //   - everything else → ignored
      let notificationType: 'pre_match' | 'congrats' | null = null;
      if (event.canvas_id && event.canvas_id === wcCanvasId) {
        notificationType = 'pre_match';
      } else if (event.campaign_id && wcCongratsCampaignId && event.campaign_id === wcCongratsCampaignId) {
        notificationType = 'congrats';
      }
      if (!notificationType) {
        ignored++;
        continue;
      }

      const props = event.properties ?? {};
      const propMatchId = (props.match_id as string | undefined) ?? null;
      const propTargetTeam = (props.target_team_en as string | undefined) ?? null;
      const deliveredAt = event.time
        ? new Date(event.time * 1000).toISOString()
        : new Date().toISOString();

      // ---------- correlation (pre_match only — congrats has no schedule ledger) ----------
      let ledgerId: string | null = null;
      let matchUuid: string | null = propMatchId;

      if (notificationType === 'pre_match') {
        // 1) by send_id
        if (!ledgerId && event.send_id) {
          const { data } = await supabase
            .from('wc_schedule_ledger')
            .select('id, match_id')
            .eq('braze_send_id', event.send_id)
            .limit(1)
            .maybeSingle();
          if (data) { ledgerId = data.id; matchUuid = matchUuid ?? data.match_id; }
        }
        // 2) time-window + match_id from props
        if (!ledgerId && propMatchId) {
          const start = new Date(new Date(deliveredAt).getTime() - 10 * 60 * 1000).toISOString();
          const end   = new Date(new Date(deliveredAt).getTime() + 10 * 60 * 1000).toISOString();
          let q = supabase
            .from('wc_schedule_ledger')
            .select('id, match_id')
            .eq('match_id', propMatchId)
            .gte('scheduled_send_at_utc', start)
            .lte('scheduled_send_at_utc', end)
            .limit(1);
          if (propTargetTeam) q = q.eq('target_team_canonical', propTargetTeam);
          const { data } = await q.maybeSingle();
          if (data) { ledgerId = data.id; matchUuid = matchUuid ?? data.match_id; }
        }
      }

      const { error: insertErr } = await supabase.from('wc_notification_sends').insert({
        ledger_id: ledgerId,
        match_id: matchUuid,
        braze_dispatch_id: event.dispatch_id ?? null,
        braze_send_id: event.send_id ?? null,
        external_user_id: event.external_user_id ?? event.user_id ?? null,
        delivered_at: deliveredAt,
        delivery_status: event.event_type ?? 'sent',
        braze_event_type: event.event_type ?? null,
        canvas_id: event.canvas_id ?? null,
        canvas_name: event.canvas_name ?? null,
        canvas_step_name: event.canvas_step_name ?? null,
        notification_type: notificationType,
        braze_webhook_payload: event as unknown as Record<string, unknown>,
      });

      if (insertErr) {
        console.error('insert wc_notification_sends:', insertErr);
        continue;
      }
      inserted++;

      if (ledgerId) {
        await supabase
          .from('wc_schedule_ledger')
          .update({ status: 'delivered', updated_at: new Date().toISOString() })
          .eq('id', ledgerId);
      }
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'braze-worldcup-webhook',
      log_level: 'info',
      message: `Processed ${inserted} delivery events (${ignored} ignored)`,
      context: { inserted, ignored, total: events.length },
    });

    return new Response(
      JSON.stringify({ success: true, inserted, ignored }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('braze-worldcup-webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
