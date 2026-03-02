import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: accept admin JWT or cron secret
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    let isAuthorized = false;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");

      // Check if it's the cron secret
      if (cronSecret && token === cronSecret) {
        isAuthorized = true;
      } else {
        // Validate as JWT
        const supabaseAuth = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
        if (!claimsError && claimsData?.claims) {
          const userId = claimsData.claims.sub;
          // Check admin role
          const { data: roleData } = await supabaseAuth
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "admin")
            .maybeSingle();
          if (roleData) isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse params
    const url = new URL(req.url);
    const length = Math.min(parseInt(url.searchParams.get("length") || "30"), 100);

    const brazeEndpoint = Deno.env.get("BRAZE_REST_ENDPOINT");
    const brazeApiKey = Deno.env.get("BRAZE_API_KEY");
    const campaignId = Deno.env.get("BRAZE_CONGRATS_CAMPAIGN_ID");

    if (!brazeEndpoint || !brazeApiKey || !campaignId) {
      return new Response(
        JSON.stringify({ error: "Missing Braze configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Braze campaigns/data_series
    const endingAt = new Date().toISOString();
    const brazeUrl = `${brazeEndpoint}/campaigns/data_series?campaign_id=${campaignId}&length=${length}&ending_at=${endingAt}`;

    console.log(`Fetching Braze campaign data: length=${length}`);

    const brazeResponse = await fetch(brazeUrl, {
      headers: { Authorization: `Bearer ${brazeApiKey}` },
    });

    if (!brazeResponse.ok) {
      const errorText = await brazeResponse.text();
      console.error("Braze API error:", brazeResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Braze API error", status: brazeResponse.status, details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brazeData = await brazeResponse.json();

    if (!brazeData.data || !Array.isArray(brazeData.data)) {
      console.error("Unexpected Braze response:", JSON.stringify(brazeData));
      return new Response(
        JSON.stringify({ error: "Unexpected Braze response format", response: brazeData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each day's data
    // Braze response: { data: [ { time: "2024-01-01", unique_recipients: N, conversions: N, messages: { ios_push: {...}, android_push: {...} } }, ... ] }
    const rows = brazeData.data.map((day: any) => {
      const messages = day.messages || {};
      
      // Aggregate across all push channels (ios_push, android_push, etc.)
      let sent = 0, direct_opens = 0, total_opens = 0, bounces = 0, body_clicks = 0;
      
      for (const [channel, stats] of Object.entries(messages)) {
        if (channel.includes("push") && typeof stats === "object" && stats !== null) {
          const s = stats as Record<string, number>;
          sent += s.sent || 0;
          direct_opens += s.direct_opens || 0;
          total_opens += s.total_opens || 0;
          bounces += s.bounces || 0;
          body_clicks += s.body_clicks || 0;
        }
      }

      return {
        campaign_id: campaignId,
        notification_type: "congrats",
        date: day.time.split("T")[0], // Extract date part
        unique_recipients: day.unique_recipients || 0,
        sent,
        direct_opens,
        total_opens,
        bounces,
        body_clicks,
        conversions: day.conversions || 0,
        raw_data: day,
        synced_at: new Date().toISOString(),
      };
    });

    // Upsert into campaign_analytics using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let upserted = 0;
    let errors = 0;

    // Upsert in batches
    for (const row of rows) {
      const { error } = await supabase
        .from("campaign_analytics")
        .upsert(row, { onConflict: "campaign_id,date" });

      if (error) {
        console.error(`Error upserting date ${row.date}:`, error);
        errors++;
      } else {
        upserted++;
      }
    }

    const summary = {
      success: true,
      campaign_id: campaignId,
      days_fetched: brazeData.data.length,
      rows_upserted: upserted,
      errors,
      date_range: {
        from: rows.length > 0 ? rows[rows.length - 1].date : null,
        to: rows.length > 0 ? rows[0].date : null,
      },
    };

    console.log("Sync complete:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-campaign-analytics error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
