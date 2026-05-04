// ============================================================================
// braze-worldcup-webhook
// ----------------------------------------------------------------------------
// HTTP endpoint that receives Braze delivery confirmations for the WC Canvas.
// Inserts into wc_notification_sends and updates the matching wc_schedule_ledger
// row to status='delivered'.
//
// Auth: shared secret in `X-Braze-Webhook-Secret` header (env BRAZE_WEBHOOK_SHARED_SECRET).
//
// Lives in PARALLEL with the existing braze-webhook (which writes to the club
// scheduler tables). This function only writes to wc_* tables.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-braze-webhook-secret',
};

interface BrazeEvent {
  external_user_id?: string;
  user_id?: string;
  time?: number;
  event_type?: string;
  canvas_id?: string;
  canvas_name?: string;
  canvas_step_id?: string;
  send_id?: string;
  dispatch_id?: string;
  properties?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Auth
    const expectedSecret = Deno.env.get('BRAZE_WEBHOOK_SHARED_SECRET');
    const receivedSecret = req.headers.get('x-braze-webhook-secret');
    if (expectedSecret && receivedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const wcCanvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');
    if (!wcCanvasId) {
      throw new Error('Missing BRAZE_WC_CANVAS_ID');
    }

    const payload = await req.json();
    const events: BrazeEvent[] = payload.events ?? (Array.isArray(payload) ? payload : [payload]);

    let inserted = 0;
    let ignored = 0;

    for (const event of events) {
      // Only process events for the WC Canvas — ignore club football events
      if (event.canvas_id && event.canvas_id !== wcCanvasId) {
        ignored++;
        continue;
      }

      // Find matching ledger row by send_id (preferred) or dispatch_id
      let ledgerId: string | null = null;
      if (event.send_id) {
        const { data } = await supabase
          .from('wc_schedule_ledger')
          .select('id')
          .eq('braze_send_id', event.send_id)
          .limit(1)
          .maybeSingle();
        ledgerId = data?.id ?? null;
      }

      const deliveredAt = event.time
        ? new Date(event.time * 1000).toISOString()
        : new Date().toISOString();

      const { error: insertErr } = await supabase
        .from('wc_notification_sends')
        .insert({
          ledger_id: ledgerId,
          braze_dispatch_id: event.dispatch_id ?? null,
          braze_send_id: event.send_id ?? null,
          external_user_id: event.external_user_id ?? event.user_id ?? null,
          delivered_at: deliveredAt,
          delivery_status: event.event_type ?? 'sent',
          braze_event_type: event.event_type ?? null,
          braze_webhook_payload: event as unknown as Record<string, unknown>,
        });

      if (insertErr) {
        console.error('Failed to insert wc_notification_sends:', insertErr);
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
      message: `Processed ${inserted} delivery events (${ignored} ignored as non-WC)`,
      context: { inserted, ignored, total: events.length },
    });

    return new Response(
      JSON.stringify({ success: true, inserted, ignored }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('braze-worldcup-webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
