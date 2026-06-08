// Daily sync of WC analytics from Braze APIs.
// Pulls /canvas/data_series for BRAZE_WC_CANVAS_ID (pre-game)
// and /campaigns/data_series for BRAZE_WC_CONGRATS_CAMPAIGN_ID (congrats)
// and upserts one row per (stat_date, braze_object_id) into wc_canvas_daily_stats.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const BRAZE_KEY = Deno.env.get('BRAZE_API_KEY')!;
const BRAZE_ENDPOINT = Deno.env.get('BRAZE_REST_ENDPOINT')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type DailyAgg = {
  entries: number;
  unique_recipients: number;
  sent: number;
  total_opens: number;
  direct_opens: number;
  bounces: number;
  body_clicks: number;
  conversions: number;
  revenue: number;
};

function emptyAgg(): DailyAgg {
  return {
    entries: 0, unique_recipients: 0, sent: 0, total_opens: 0, direct_opens: 0,
    bounces: 0, body_clicks: 0, conversions: 0, revenue: 0,
  };
}

function addChannelStats(agg: DailyAgg, ch: any) {
  if (!ch || typeof ch !== 'object') return;
  agg.sent += Number(ch.sent || 0);
  agg.total_opens += Number(ch.total_opens || 0);
  agg.direct_opens += Number(ch.direct_opens || 0);
  agg.bounces += Number(ch.bounces || 0);
  agg.body_clicks += Number(ch.body_clicks || 0);
  agg.unique_recipients += Number(ch.unique_recipients || 0);
}

// Walk arbitrary nested messages object aggregating push/email/webhook channels.
function walkMessages(obj: any, agg: DailyAgg) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach((x) => walkMessages(x, agg)); return; }
  // A channel object typically has "sent" or "total_opens" or "bounces"
  if ('sent' in obj || 'total_opens' in obj || 'bounces' in obj || 'body_clicks' in obj) {
    addChannelStats(agg, obj);
    return;
  }
  for (const v of Object.values(obj)) walkMessages(v, agg);
}

async function syncCanvas(canvasId: string, days: number) {
  const params = new URLSearchParams({
    canvas_id: canvasId, length: String(days),
    include_variant_breakdown: 'true', include_step_breakdown: 'true',
  });
  const res = await fetch(`${BRAZE_ENDPOINT}/canvas/data_series?${params}`, {
    headers: { Authorization: `Bearer ${BRAZE_KEY}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`canvas/data_series ${res.status}: ${JSON.stringify(body)}`);

  const name = body?.data?.name ?? null;
  const stats: any[] = body?.data?.stats || [];
  const rows = stats.map((d: any) => {
    const agg = emptyAgg();
    agg.entries = Number(d.total_stats?.entries || 0);
    agg.revenue = Number(d.total_stats?.revenue || 0);
    agg.conversions = Number(d.total_stats?.conversions || 0);
    // Aggregate channels under variant_stats -> messages
    walkMessages(d.variant_stats, agg);
    walkMessages(d.step_stats, agg);
    return {
      stat_date: String(d.time).slice(0, 10),
      braze_object_id: canvasId,
      object_type: 'canvas' as const,
      name,
      ...agg,
      step_breakdown: d.step_stats ?? null,
      variant_breakdown: d.variant_stats ?? null,
      raw_payload: d,
      synced_at: new Date().toISOString(),
    };
  });
  return rows;
}

async function syncCampaign(campaignId: string, days: number) {
  const params = new URLSearchParams({
    campaign_id: campaignId, length: String(days),
  });
  const res = await fetch(`${BRAZE_ENDPOINT}/campaigns/data_series?${params}`, {
    headers: { Authorization: `Bearer ${BRAZE_KEY}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`campaigns/data_series ${res.status}: ${JSON.stringify(body)}`);

  const name = body?.data?.name ?? body?.message ?? null;
  const series: any[] = body?.data || [];
  const rows = series.map((d: any) => {
    const agg = emptyAgg();
    walkMessages(d.messages, agg);
    agg.conversions = Number(d.conversions || 0);
    agg.revenue = Number(d.revenue || 0);
    return {
      stat_date: String(d.time).slice(0, 10),
      braze_object_id: campaignId,
      object_type: 'campaign' as const,
      name,
      ...agg,
      step_breakdown: null,
      variant_breakdown: d.messages ?? null,
      raw_payload: d,
      synced_at: new Date().toISOString(),
    };
  });
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: allow CRON_SECRET header or an authenticated admin (front-end button).
    const provided = req.headers.get('x-cron-secret');
    const isCron = CRON_SECRET && provided === CRON_SECRET;
    if (!isCron) {
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
      const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || '14');

    const canvasId = Deno.env.get('BRAZE_WC_CANVAS_ID');
    const congratsCampaignId = Deno.env.get('BRAZE_WC_CONGRATS_CAMPAIGN_ID');

    const allRows: any[] = [];
    const summary: Record<string, number> = {};

    if (canvasId) {
      const rows = await syncCanvas(canvasId, days);
      allRows.push(...rows);
      summary.canvas_rows = rows.length;
    }
    if (congratsCampaignId) {
      const rows = await syncCampaign(congratsCampaignId, days);
      allRows.push(...rows);
      summary.congrats_rows = rows.length;
    }

    if (allRows.length) {
      const { error } = await supabase
        .from('wc_canvas_daily_stats')
        .upsert(allRows, { onConflict: 'stat_date,braze_object_id' });
      if (error) throw error;
    }

    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'sync-wc-canvas-analytics',
      log_level: 'info',
      message: 'sync complete',
      context: { days, ...summary, total_rows: allRows.length },
    });

    return new Response(JSON.stringify({ ok: true, days, ...summary, total_rows: allRows.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from('wc_scheduler_logs').insert({
      function_name: 'sync-wc-canvas-analytics',
      log_level: 'error',
      message: 'sync failed',
      context: { error: msg },
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
