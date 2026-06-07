// One-off diagnostic: pull /canvas/data_series for a given canvas_id
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const canvasId = url.searchParams.get('canvas_id');
    const days = Number(url.searchParams.get('length') || '3');
    if (!canvasId) {
      return new Response(JSON.stringify({ error: 'canvas_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const key = Deno.env.get('BRAZE_API_KEY');
    const endpoint = Deno.env.get('BRAZE_REST_ENDPOINT');
    if (!key || !endpoint) throw new Error('Missing Braze env');

    // Default ending_at = now
    const params = new URLSearchParams({
      canvas_id: canvasId,
      length: String(days),
      include_variant_breakdown: 'true',
      include_step_breakdown: 'true',
    });

    const res = await fetch(`${endpoint}/canvas/data_series?${params}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await res.json();
    return new Response(JSON.stringify({ status: res.status, body }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
