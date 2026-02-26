import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BRAZE_API_KEY = Deno.env.get("BRAZE_API_KEY")!;
const BRAZE_REST_ENDPOINT = Deno.env.get("BRAZE_REST_ENDPOINT")!;
const BRAZE_CAMPAIGN_ID = Deno.env.get("BRAZE_CAMPAIGN_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SYSTEM_PROMPT = `You are a Growth Operations Copilot for 1001 Sports. You help create and send Braze push notification campaigns.

Your capabilities:
1. List featured teams from the database
2. Look up upcoming matches
3. Preview a campaign (validate inputs, show what will be sent)
4. Confirm and send a campaign via Braze API
5. View campaign history

CRITICAL SAFETY RULES:
- You MUST call preview_campaign before confirm_and_send. Never send without previewing first.
- Always ask the user for explicit confirmation before calling confirm_and_send.
- Show the preview card and ask "Should I send this?" before proceeding.
- If the user says "send" without a preview, call preview_campaign first.

When a user wants to send a campaign:
1. Gather: campaign name, target audience (team-based segment), message title & body
2. Call preview_campaign to validate and show preview
3. Ask for confirmation
4. Only then call confirm_and_send

For audience targeting, use Braze custom attributes. Each featured team has a braze_attribute_value.
The campaign uses trigger properties to customize the push notification content.`;

const tools = [
  {
    type: "function",
    function: {
      name: "list_featured_teams",
      description:
        "List all featured teams from the database with their Braze attribute values for audience targeting.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_upcoming_matches",
      description:
        "Look up upcoming matches, optionally filtered by team name or competition.",
      parameters: {
        type: "object",
        properties: {
          team: {
            type: "string",
            description: "Filter by team name (partial match)",
          },
          competition: {
            type: "string",
            description: "Filter by competition code",
          },
          days_ahead: {
            type: "number",
            description: "How many days ahead to look (default 7)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview_campaign",
      description:
        "Validate and preview a campaign before sending. Returns a formatted preview. MUST be called before confirm_and_send.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          title: { type: "string", description: "Push notification title" },
          body: { type: "string", description: "Push notification body text" },
          target_teams: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of team names to target (uses their braze_attribute_value)",
          },
          schedule_time: {
            type: "string",
            description:
              "ISO 8601 datetime for scheduled send, or 'now' for immediate",
          },
        },
        required: ["name", "title", "body", "target_teams"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_and_send",
      description:
        "Actually send the campaign via Braze API. Only call this AFTER preview_campaign and user confirmation.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          title: { type: "string", description: "Push notification title" },
          body: { type: "string", description: "Push notification body text" },
          target_teams: {
            type: "array",
            items: { type: "string" },
            description: "Array of team names to target",
          },
          schedule_time: {
            type: "string",
            description: "ISO 8601 datetime or 'now'",
          },
        },
        required: ["name", "title", "body", "target_teams"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_history",
      description: "Get recent copilot campaign history.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of campaigns to return (default 10)",
          },
        },
      },
    },
  },
];

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (toolName) {
      case "list_featured_teams": {
        const { data, error } = await serviceClient
          .from("featured_teams")
          .select("team_name, braze_attribute_value")
          .order("team_name");
        if (error) throw error;
        return JSON.stringify({ teams: data });
      }

      case "lookup_upcoming_matches": {
        const daysAhead = (args.days_ahead as number) || 7;
        const now = new Date().toISOString();
        const future = new Date(
          Date.now() + daysAhead * 86400000
        ).toISOString();

        let query = serviceClient
          .from("matches")
          .select(
            "id, home_team, away_team, competition, competition_name, utc_date, status"
          )
          .gte("utc_date", now)
          .lte("utc_date", future)
          .order("utc_date");

        if (args.team) {
          const team = args.team as string;
          query = query.or(
            `home_team.ilike.%${team}%,away_team.ilike.%${team}%`
          );
        }
        if (args.competition) {
          query = query.eq("competition", args.competition as string);
        }

        const { data, error } = await query.limit(20);
        if (error) throw error;
        return JSON.stringify({ matches: data, count: data?.length || 0 });
      }

      case "preview_campaign": {
        const { name, title, body, target_teams, schedule_time } = args as {
          name: string;
          title: string;
          body: string;
          target_teams: string[];
          schedule_time?: string;
        };

        // Look up braze attribute values for target teams
        const { data: teams } = await serviceClient
          .from("featured_teams")
          .select("team_name, braze_attribute_value")
          .in("team_name", target_teams);

        const targetSegments = (teams || []).map((t) => ({
          team: t.team_name,
          attribute: t.braze_attribute_value,
        }));

        const unknownTeams = target_teams.filter(
          (t) => !teams?.find((ft) => ft.team_name === t)
        );

        return JSON.stringify({
          preview: {
            name,
            title,
            body,
            target_teams: targetSegments,
            unknown_teams: unknownTeams,
            schedule: schedule_time || "immediate",
            braze_campaign_id: BRAZE_CAMPAIGN_ID,
            estimated_reach: "Based on Braze segment filters",
          },
          validation: {
            valid: unknownTeams.length === 0 && title.length > 0 && body.length > 0,
            errors: [
              ...(unknownTeams.length > 0
                ? [`Unknown teams: ${unknownTeams.join(", ")}`]
                : []),
              ...(title.length === 0 ? ["Title is required"] : []),
              ...(body.length === 0 ? ["Body is required"] : []),
            ],
          },
        });
      }

      case "confirm_and_send": {
        // Rate limit check: max 5 sends per hour
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { count } = await serviceClient
          .from("copilot_campaigns")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent")
          .eq("created_by", userId)
          .gte("sent_at", oneHourAgo);

        if ((count || 0) >= 5) {
          return JSON.stringify({
            error: "Rate limit exceeded: maximum 5 sends per hour",
          });
        }

        const { name, title, body, target_teams, schedule_time } = args as {
          name: string;
          title: string;
          body: string;
          target_teams: string[];
          schedule_time?: string;
        };

        // Look up braze attribute values
        const { data: teams } = await serviceClient
          .from("featured_teams")
          .select("team_name, braze_attribute_value")
          .in("team_name", target_teams);

        if (!teams || teams.length === 0) {
          return JSON.stringify({ error: "No valid target teams found" });
        }

        // Build audience filter using custom attributes
        const audienceFilter = teams.map((t) => ({
          custom_attribute: {
            custom_attribute_name: "favourite_team",
            value: t.braze_attribute_value,
          },
        }));

        const triggerProperties = {
          title,
          body,
          campaign_name: name,
          sent_by: "copilot",
        };

        // Call Braze API
        const brazePayload: Record<string, unknown> = {
          campaign_id: BRAZE_CAMPAIGN_ID,
          recipients: [],
          audience: {
            OR: audienceFilter,
          },
          trigger_properties: triggerProperties,
        };

        if (schedule_time && schedule_time !== "now") {
          // Use schedule endpoint
          const brazeRes = await fetch(
            `${BRAZE_REST_ENDPOINT}/campaigns/trigger/schedule/create`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${BRAZE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ...brazePayload,
                schedule: { time: schedule_time },
              }),
            }
          );

          const brazeData = await brazeRes.json();

          if (!brazeRes.ok) {
            // Log error
            await serviceClient.from("copilot_campaigns").insert({
              name,
              status: "error",
              segment_filter: { target_teams, audience: audienceFilter },
              trigger_properties: triggerProperties,
              braze_campaign_id: BRAZE_CAMPAIGN_ID,
              scheduled_at: schedule_time,
              created_by: userId,
            });

            return JSON.stringify({
              error: "Braze API error",
              details: brazeData,
            });
          }

          // Log success
          await serviceClient.from("copilot_campaigns").insert({
            name,
            status: "sent",
            segment_filter: { target_teams, audience: audienceFilter },
            trigger_properties: triggerProperties,
            braze_campaign_id: BRAZE_CAMPAIGN_ID,
            braze_dispatch_id: brazeData.dispatch_id,
            scheduled_at: schedule_time,
            sent_at: new Date().toISOString(),
            created_by: userId,
          });

          await serviceClient.from("scheduler_logs").insert({
            function_name: "growth-copilot",
            action: "campaign_scheduled",
            reason: `Scheduled campaign "${name}" for ${schedule_time}`,
            details: {
              campaign_name: name,
              target_teams,
              dispatch_id: brazeData.dispatch_id,
            },
          });

          return JSON.stringify({
            success: true,
            type: "scheduled",
            dispatch_id: brazeData.dispatch_id,
            scheduled_for: schedule_time,
          });
        } else {
          // Immediate send
          const brazeRes = await fetch(
            `${BRAZE_REST_ENDPOINT}/campaigns/trigger/send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${BRAZE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(brazePayload),
            }
          );

          const brazeData = await brazeRes.json();

          if (!brazeRes.ok) {
            await serviceClient.from("copilot_campaigns").insert({
              name,
              status: "error",
              segment_filter: { target_teams, audience: audienceFilter },
              trigger_properties: triggerProperties,
              braze_campaign_id: BRAZE_CAMPAIGN_ID,
              created_by: userId,
            });

            return JSON.stringify({
              error: "Braze API error",
              details: brazeData,
            });
          }

          await serviceClient.from("copilot_campaigns").insert({
            name,
            status: "sent",
            segment_filter: { target_teams, audience: audienceFilter },
            trigger_properties: triggerProperties,
            braze_campaign_id: BRAZE_CAMPAIGN_ID,
            braze_dispatch_id: brazeData.dispatch_id,
            sent_at: new Date().toISOString(),
            created_by: userId,
          });

          await serviceClient.from("scheduler_logs").insert({
            function_name: "growth-copilot",
            action: "campaign_sent",
            reason: `Sent campaign "${name}" immediately`,
            details: {
              campaign_name: name,
              target_teams,
              dispatch_id: brazeData.dispatch_id,
            },
          });

          return JSON.stringify({
            success: true,
            type: "immediate",
            dispatch_id: brazeData.dispatch_id,
          });
        }
      }

      case "get_campaign_history": {
        const limit = (args.limit as number) || 10;
        const { data, error } = await serviceClient
          .from("copilot_campaigns")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return JSON.stringify({ campaigns: data });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    console.error(`Tool ${toolName} error:`, err);
    return JSON.stringify({
      error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Check admin role
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roles) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { messages, session_id } = await req.json();

    // Build messages for AI
    const aiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    // AI tool-calling loop
    let currentMessages = aiMessages;
    let maxIterations = 10;

    while (maxIterations-- > 0) {
      const aiResponse = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: currentMessages,
            tools,
            stream: false,
          }),
        }
      );

      if (!aiResponse.ok) {
        const status = aiResponse.status;
        if (status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit exceeded, please try again later." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (status === 402) {
          return new Response(
            JSON.stringify({ error: "Payment required, please add credits." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const errText = await aiResponse.text();
        console.error("AI gateway error:", status, errText);
        throw new Error("AI gateway error");
      }

      const aiData = await aiResponse.json();
      const choice = aiData.choices?.[0];

      if (!choice) throw new Error("No AI response");

      const assistantMessage = choice.message;
      currentMessages.push(assistantMessage);

      // Check if AI wants to call tools
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        for (const toolCall of assistantMessage.tool_calls) {
          const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          const toolResult = await executeTool(
            toolCall.function.name,
            toolArgs,
            userId
          );

          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
        // Continue loop to get AI's response after tool results
        continue;
      }

      // No tool calls — we have the final response
      const finalContent = assistantMessage.content || "";

      // Save to copilot_messages if session_id provided
      if (session_id) {
        // Save the last user message and assistant response
        const lastUserMsg = messages[messages.length - 1];
        if (lastUserMsg) {
          await serviceClient.from("copilot_messages").insert({
            session_id,
            role: "user",
            content: lastUserMsg.content,
            user_id: userId,
          });
        }
        await serviceClient.from("copilot_messages").insert({
          session_id,
          role: "assistant",
          content: finalContent,
          tool_calls: assistantMessage.tool_calls || null,
          user_id: userId,
        });
      }

      return new Response(
        JSON.stringify({
          content: finalContent,
          tool_calls_made: currentMessages
            .filter((m: Record<string, unknown>) => m.role === "tool")
            .map((m: Record<string, unknown>) => m.content),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Max tool iterations reached" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("growth-copilot error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
