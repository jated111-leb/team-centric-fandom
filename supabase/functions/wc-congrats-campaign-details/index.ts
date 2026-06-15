import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const endpoint = Deno.env.get('BRAZE_REST_ENDPOINT')!;
  const apiKey = Deno.env.get('BRAZE_API_KEY')!;
  const campaignId = Deno.env.get('BRAZE_WC_CONGRATS_CAMPAIGN_ID')!;

  const res = await fetch(`${endpoint}/campaigns/details?campaign_id=${campaignId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await res.json();
  return new Response(JSON.stringify(body, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: res.status,
  });
});
