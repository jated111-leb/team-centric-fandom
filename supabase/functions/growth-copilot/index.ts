import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const BRAZE_API_KEY = Deno.env.get("BRAZE_COPILOT_API_KEY")!;
const BRAZE_REST_ENDPOINT = Deno.env.get("BRAZE_REST_ENDPOINT")!;
// BRAZE_CAMPAIGN_ID removed — /messages/send doesn't use campaign_id
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SYSTEM_PROMPT = `You are a Growth Operations Copilot for 1001 Sports. You help create and send Braze push notification and in-app message (IAM) campaigns.

Your capabilities:
1. List featured teams from the database
2. Look up upcoming matches
3. Preview a campaign (validate inputs, show what will be sent)
4. Confirm and send a campaign via Braze API
5. View campaign history
6. List available Braze segments (call list_braze_segments to find segment IDs)
7. Get segment details including estimated audience size (call get_segment_details)

HOW THIS COPILOT SENDS NOTIFICATIONS:
- This copilot sends via Braze /messages/send with explicit messaging objects.
- Push: uses apple_push and android_push objects. Title and body are sent directly — no campaign template or Liquid tags needed.
- Rich Push (images): You can attach an image to push notifications. Provide image_url (a publicly accessible URL to a JPEG, PNG, or GIF).
  - iOS: sets asset_url + asset_file_type + mutable_content on the apple_push object. iOS rich notifications support JPEG, PNG, GIF (max 10MB, recommended 1038x1038).
  - Android: sets appboy_image_url in the extra object for "Big Picture" expanded notifications. Images should be 2:1 aspect ratio, at least 600x300px. Only static JPEG/PNG supported.
- In-App Messages (IAM): uses the in_app_message object. Supports slideup, modal, and full types.
- You can send push only, IAM only, or both together in a single campaign.
- This guarantees the exact content you specify reaches the user.
- When using external_user_ids (individual targeting), send_to_existing_only is set to true on each recipient — if the user doesn't exist in Braze, that recipient is skipped silently. This does NOT apply to segment or audience-based targeting.

PRODUCTION PAYLOAD GUIDELINES:
- Deep links: Always suggest adding a deep_link when the user doesn't provide one. Deep links drive deterministic actions from push notifications. Pass deep_link to preview_campaign and confirm_and_send — it maps to custom_uri on iOS and Android.
- Image specs: Android Big Picture requires 2:1 aspect ratio, minimum 600×300px. iOS rich push supports JPEG/PNG/GIF up to 10MB (recommended 1038×1038).
- Payload size limits: iOS combined alert+extra must not exceed 1912 bytes. Android alert+extra must not exceed 4000 bytes. Warn the user if content looks large.
- broadcast:true is automatically added when targeting a segment_id without individual recipients — this is required by Braze docs.
- send_to_most_recent_device_only defaults to false (all devices). If the user asks to send to the most recent device only, set send_to_most_recent_device_only: true in preview_campaign / confirm_and_send.

IN-APP MESSAGE (IAM) GUIDELINES:
- Use channels: ["push", "iam"] or channels: ["iam"] to include in-app messages.
- Default channel is ["push"] if not specified.
- IAM types:
  - "slideup" — non-intrusive bar that slides from top or bottom. Great for tips, alerts, quick announcements.
  - "modal" — centered overlay with optional header, body, image, and buttons. Good for promotions, confirmations.
  - "full" — full-screen takeover with image, header, body, buttons. Use for major announcements.
- When the user says "tooltip", "toast", "toast bar", or "slide-up", use type "slideup".
- When the user says "popup", "dialog", or "overlay", use type "modal".
- When the user says "takeover" or "full screen", use type "full".
- IAM messages are displayed when the user next opens the app (session start trigger by default).

SEGMENT LOOKUP:
- When a user mentions targeting a segment by name (e.g. "growth team", "weekly active users"), you MUST immediately call list_braze_segments to resolve the name to a segment_id. Do NOT ask the user for the ID — resolve it yourself.
- If exactly one segment matches the name, use it directly. If multiple match, present them and ask the user to pick.
- Use the resolved segment_id in preview_campaign / confirm_and_send.

AUDIENCE SIZING (CRITICAL):
- When previewing a campaign that targets a segment, ALWAYS call get_segment_details to fetch the estimated audience size and include it in the preview.
- Display the audience size prominently so the user knows how many users they are reaching BEFORE confirming.
- When combining a segment with filters, explain to the user that the filters will narrow down the segment audience, so the actual reach will be smaller than the segment size shown.
- If the audience looks too large, suggest adding filters. If too small, suggest broadening.

SEGMENT BROWSING:
- When the user asks to browse, explore, or list segments, call list_braze_segments and present them in a formatted list with names and IDs.
- If the user wants more details on a specific segment (size, tags, description), call get_segment_details with that segment_id.

SAFE TESTING WORKFLOW:
- Recommended workflow: dry_run first → test_mode send → full send
- When the user is testing or trying the copilot for the first time, suggest using test_mode: true which sends only to the test user (874810).
- dry_run: true — builds the full payload, validates targeting, logs campaign with status 'dry_run', returns the exact Braze payload. Zero sends.
- CRITICAL DRY RUN FLOW: When the user says "dry run" or "do a dry run", you must:
  1. Call preview_campaign first to validate and show the preview.
  2. Then IMMEDIATELY call confirm_and_send with dry_run: true in the SAME turn — do NOT ask for user confirmation. A dry run is safe (zero sends), so no confirmation is needed.
  3. Display the FULL braze_payload JSON from the dry run result in a formatted JSON code block. Never summarize or omit the payload.
- test_mode: true — overrides all targeting to send ONLY to external_user_id "874810" (test account). Real Braze send but only to one user.
- Both flags can be set on confirm_and_send.

CRITICAL SAFETY RULES:
- For REAL sends (not dry_run, not test_mode): You MUST call preview_campaign before confirm_and_send AND ask for explicit user confirmation.
- Show the preview card and ask "Should I send this?" before proceeding with a real send.
- If the user says "send" without a preview, call preview_campaign first.
- When a user confirms a send for the first time, suggest dry_run or test_mode before doing a full send.
- Exception: dry_run does NOT require user confirmation — preview then immediately execute the dry run in one turn.

AUDIENCE TARGETING:
You can target campaigns using multiple methods, alone or combined:

1. **target_teams** (shorthand): Array of team names. Auto-expands to favourite_team custom attribute filters. 
   Example: target_teams: ["Al Hilal", "Al Ahli"]

2. **audience** (full Braze Connected Audience object): Arbitrary AND/OR filter combinations.
   Supports:
   - Custom attributes: { "custom_attribute": { "custom_attribute_name": "favourite_team", "value": "Al Hilal" } }
     Comparisons: equals, not_equal, matches_regex, exists, does_not_exist, includes_value, does_not_include_value
   - Push subscription: { "push_subscription_status": { "comparison": "is", "value": "opted_in" } }
   - Email subscription: { "email_subscription_status": { "comparison": "is", "value": "subscribed" } }
   - Combine with AND/OR:
     { "AND": [ { "custom_attribute": {...} }, { "push_subscription_status": {...} } ] }
     { "OR": [ { "custom_attribute": {...} }, { "custom_attribute": {...} } ] }

3. **segment_id**: Target an existing Braze segment by ID.
   Example: segment_id: "segment_abc123"

4. **external_user_ids**: Array of specific user IDs for individual targeting.
   Example: external_user_ids: ["user_123", "user_456"]

All methods can be combined. For example, you can target a segment with additional audience filters and specific user IDs.

When a user wants to send a campaign:
1. Gather: campaign name, target audience, message title & body
2. If targeting a segment, call get_segment_details to fetch and show audience size
3. Call preview_campaign to validate and show preview (include audience size in your response)
4. Ask for confirmation
5. Only then call confirm_and_send

TIMEZONE HANDLING:
- The default timezone for this system is Asia/Baghdad (Iraq Standard Time, UTC+3).
- When the user says a time without specifying a timezone (e.g. "send at 7pm", "schedule for tomorrow at 3:30pm"), ALWAYS interpret it as Asia/Baghdad time and convert to UTC (ISO 8601) before passing to schedule_time.
- Conversion: subtract 3 hours from Baghdad time to get UTC. Example: "7pm Baghdad" = "16:00 UTC" → "2026-02-28T16:00:00Z"
- Iraq does not currently observe daylight saving time, so the offset is always +03:00.
- When showing times back to the user, display both Baghdad local time AND UTC. Example: "Scheduled for 7:00 PM Baghdad (4:00 PM UTC)"
- If the user explicitly provides a timezone (e.g. "3pm GST", "2pm UTC"), respect their timezone instead.
- The schedule_time parameter sent to Braze must ALWAYS be in UTC ISO 8601 format.

BIDI TEXT OPTIMIZATION (CRITICAL FOR ARABIC):
- Braze frequently breaks bidirectional (BiDi) text rendering in push notifications, especially with mixed Arabic + English/numbers/URLs.
- When the user writes or you generate Arabic push text that contains ANY LTR islands (Latin words, numbers, domains, URLs, coupon codes, Liquid variables like {{first_name}}), you MUST apply BiDi optimization.
- Call the optimize_bidi tool with the text to get a Braze-safe version with proper Unicode directional marks embedded.
- ALWAYS use the BiDi-optimized version in the final push payload (title and body).
- If the user provides purely English text with no Arabic, skip BiDi optimization.
- When previewing a campaign with Arabic text, show the annotated QA version so the user can verify mark placement.
- The optimize_bidi tool returns both the Braze-ready string (with real invisible Unicode marks) and an annotated QA version with visible [RLE], [LRE], [PDF] tags.`;


const audienceParamSchema = {
  type: "object" as const,
  description:
    "Braze Connected Audience object with AND/OR filter combinations. Supports custom_attribute, push_subscription_status, email_subscription_status filters.",
};

const commonTargetingParams = {
  target_teams: {
    type: "array" as const,
    items: { type: "string" as const },
    description:
      "Optional shorthand: array of team names (auto-expands to favourite_team custom attribute filters)",
  },
  audience: audienceParamSchema,
  segment_id: {
    type: "string" as const,
    description: "Optional Braze segment ID to target directly",
  },
  external_user_ids: {
    type: "array" as const,
    items: { type: "string" as const },
    description: "Optional array of external user IDs for individual targeting",
  },
};

const channelParams = {
  image_url: {
    type: "string" as const,
    description: "Optional publicly accessible image URL (JPEG, PNG, or GIF) to attach to the push notification as a rich notification. iOS: appears as expanded media. Android: appears as Big Picture expanded image (2:1 aspect ratio recommended).",
  },
  deep_link: {
    type: "string" as const,
    description: "Optional deep link URI to open when the push notification is tapped. Maps to custom_uri on both iOS and Android. Example: 'myapp://match/12345' or 'https://example.com/page'.",
  },
  send_to_most_recent_device_only: {
    type: "boolean" as const,
    description: "If true, send only to the user's most recently used device. Default: false (send to all devices).",
  },
  channels: {
    type: "array" as const,
    items: { type: "string" as const, enum: ["push", "iam"] },
    description: "Channels to send on. Default: ['push']. Options: 'push', 'iam' (in-app message). Can include both.",
  },
  iam_type: {
    type: "string" as const,
    enum: ["slideup", "modal", "full"],
    description: "In-app message type: 'slideup' (tooltip/toast bar), 'modal' (centered popup), 'full' (fullscreen takeover). Default: 'slideup'. Only used when channels includes 'iam'.",
  },
  iam_header: {
    type: "string" as const,
    description: "Optional header text for modal/full IAM types. Not used for slideup.",
  },
  iam_body: {
    type: "string" as const,
    description: "IAM body text. If omitted, falls back to the push body.",
  },
  iam_image_url: {
    type: "string" as const,
    description: "Optional image URL for modal/full IAM types.",
  },
  iam_click_action: {
    type: "string" as const,
    description: "Optional deep link or URL to open when the IAM is tapped.",
  },
};

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
          ...commonTargetingParams,
          ...channelParams,
          schedule_time: {
            type: "string",
            description:
              "ISO 8601 datetime for scheduled send, or 'now' for immediate",
          },
        },
        required: ["name", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_and_send",
      description:
        "Actually send the campaign via Braze API. Only call this AFTER preview_campaign and user confirmation. Supports dry_run (no send, returns payload) and test_mode (sends only to test user 874810).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          title: { type: "string", description: "Push notification title" },
          body: { type: "string", description: "Push notification body text" },
          ...commonTargetingParams,
          ...channelParams,
          schedule_time: {
            type: "string",
            description: "ISO 8601 datetime or 'now'",
          },
          dry_run: {
            type: "boolean",
            description: "If true, build and validate the full Braze payload but do NOT send. Returns the exact payload that would be sent. Logs campaign with status 'dry_run'.",
          },
          test_mode: {
            type: "boolean",
            description: "If true, override all targeting to send ONLY to test user 874810. Real Braze send but restricted to one user.",
          },
        },
        required: ["name", "title", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_braze_segments",
      description:
        "List available Braze segments with their IDs, names, and sizes. Use this to find the correct segment_id when a user wants to target a specific segment.",
      parameters: {
        type: "object",
        properties: {
          page: {
            type: "number",
            description: "Page number for pagination (default 0, 100 segments per page)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_segment_details",
      description:
        "Get detailed information about a specific Braze segment including estimated audience size, description, and tags. Use this to show users how many people they will reach before sending.",
      parameters: {
        type: "object",
        properties: {
          segment_id: {
            type: "string",
            description: "The Braze segment ID to get details for",
          },
        },
        required: ["segment_id"],
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
  {
    type: "function",
    function: {
      name: "optimize_bidi",
      description:
        "Apply BiDi (bidirectional) optimization to Arabic text that contains LTR islands (English words, numbers, URLs, Liquid variables). Returns a Braze-safe string with proper Unicode directional marks (RLE/LRE/PDF) embedded, plus an annotated QA version. MUST be called for any Arabic push text containing mixed LTR content before sending.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The Arabic text (which may contain English words, numbers, URLs, coupon codes, or Liquid variables) to optimize for BiDi rendering.",
          },
          ltr_tokens: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of known LTR tokens/variables in the text to help detect islands (e.g. ['1001', '{{coupon_code}}', 'Kabul'])",
          },
          max_length: {
            type: "number",
            description: "Maximum character limit for the output. Default: 140",
          },
        },
        required: ["text"],
      },
    },
  },
];

// Infer file type from URL for iOS asset_file_type
function inferAssetFileType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "png";
  if (lower.includes(".gif")) return "gif";
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "jpg";
  // Default to jpg for unknown
  return "jpg";
}

// Build messaging objects based on channels
function buildMessagesObject(args: Record<string, unknown>, name: string) {
  const channels = (args.channels as string[]) || ["push"];
  const title = args.title as string;
  const body = args.body as string;
  const imageUrl = args.image_url as string | undefined;
  const iamType = (args.iam_type as string) || "slideup";
  const iamHeader = args.iam_header as string | undefined;
  const iamBody = (args.iam_body as string) || body;
  const iamImageUrl = args.iam_image_url as string | undefined;
  const iamClickAction = args.iam_click_action as string | undefined;

  const deepLink = args.deep_link as string | undefined;
  const messages: Record<string, unknown> = {};

  if (channels.includes("push")) {
    const applePush: Record<string, unknown> = {
      alert: { title, body },
      extra: { campaign_name: name, sent_by: "copilot" },
    };

    const sendToMostRecent = !!(args.send_to_most_recent_device_only);
    if (sendToMostRecent) {
      applePush.send_to_most_recent_device_only = true;
    }

    const androidExtra: Record<string, string> = {
      campaign_name: name,
      sent_by: "copilot",
    };

    // Rich push: attach image
    if (imageUrl) {
      // iOS: asset_url + asset_file_type + mutable_content
      applePush.asset_url = imageUrl;
      applePush.asset_file_type = inferAssetFileType(imageUrl);
      applePush.mutable_content = true;

      // Android: appboy_image_url in extra for Big Picture
      androidExtra.appboy_image_url = imageUrl;
    }

    // Deep link support
    if (deepLink) {
      applePush.custom_uri = deepLink;
    }

    messages.apple_push = applePush;

    const androidPush: Record<string, unknown> = {
      title,
      alert: body,
      extra: androidExtra,
    };
    if (sendToMostRecent) {
      androidPush.send_to_most_recent_device_only = true;
    }
    if (deepLink) {
      androidPush.custom_uri = deepLink;
    }
    messages.android_push = androidPush;
  }

  if (channels.includes("iam")) {
    const iam: Record<string, unknown> = {
      type: iamType,
      message: iamBody,
      message_close: iamType === "slideup" ? "auto_dismiss" : "button",
      extras: { campaign_name: name, sent_by: "copilot" },
    };

    if (iamType === "slideup") {
      iam.slide_from = "bottom";
    }

    if ((iamType === "modal" || iamType === "full") && iamHeader) {
      iam.header = iamHeader;
    }

    if ((iamType === "modal" || iamType === "full") && iamImageUrl) {
      iam.image_url = iamImageUrl;
    }

    if (iamClickAction) {
      iam.click_action = "URI";
      iam.uri = iamClickAction;
    }

    messages.in_app_message = iam;
  }

  return { messages, channels };
}

// Build audience object from the various targeting params
async function buildAudienceAndRecipients(args: Record<string, unknown>) {
  const {
    target_teams,
    audience,
    segment_id,
    external_user_ids,
  } = args as {
    target_teams?: string[];
    audience?: Record<string, unknown>;
    segment_id?: string;
    external_user_ids?: string[];
  };

  let resolvedAudience: Record<string, unknown> | undefined = undefined;
  const recipients: { external_user_id: string }[] = [];
  const errors: string[] = [];
  const details: Record<string, unknown> = {};

  // 1. If target_teams shorthand, expand to favourite_team filters
  if (target_teams && target_teams.length > 0) {
    const { data: teams } = await serviceClient
      .from("featured_teams")
      .select("team_name, braze_attribute_value")
      .in("team_name", target_teams);

    const unknownTeams = target_teams.filter(
      (t) => !teams?.find((ft) => ft.team_name === t)
    );
    if (unknownTeams.length > 0) {
      errors.push(`Unknown teams: ${unknownTeams.join(", ")}`);
    }

    const teamFilters = (teams || []).map((t) => ({
      custom_attribute: {
        custom_attribute_name: "favourite_team",
        value: t.braze_attribute_value,
      },
    }));

    details.target_teams_resolved = (teams || []).map((t) => ({
      team: t.team_name,
      attribute: t.braze_attribute_value,
    }));

    if (teamFilters.length > 0) {
      resolvedAudience = { OR: teamFilters };
    }
  }

  // 2. If raw audience object provided, use it (overrides target_teams)
  if (audience) {
    resolvedAudience = audience;
    details.audience = audience;
  }

  // 3. If segment_id, wrap audience in AND with segment
  if (segment_id) {
    if (resolvedAudience) {
      resolvedAudience = {
        AND: [resolvedAudience, { segment_id }],
      };
    } else {
      // segment_id alone — no audience filter needed, will be set on the payload
      details.segment_id = segment_id;
    }
  }

  // 4. If external_user_ids, populate recipients
  if (external_user_ids && external_user_ids.length > 0) {
    for (const id of external_user_ids) {
      recipients.push({ external_user_id: id, send_to_existing_only: true });
    }
    details.external_user_ids = external_user_ids;
  }

  // Validate at least one targeting method
  if (!resolvedAudience && recipients.length === 0 && !segment_id) {
    errors.push(
      "No targeting specified. Provide target_teams, audience, segment_id, or external_user_ids."
    );
  }

  return { audience: resolvedAudience, recipients, errors, details, segment_id };
}

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
        const { name, title, body, schedule_time } = args as {
          name: string;
          title: string;
          body: string;
          schedule_time?: string;
        };

        const targeting = await buildAudienceAndRecipients(args);
        const { messages, channels } = buildMessagesObject(args, name);

        const validationErrors = [
          ...targeting.errors,
          ...(title.length === 0 ? ["Title is required"] : []),
          ...(body.length === 0 ? ["Body is required"] : []),
        ];

        return JSON.stringify({
          preview: {
            name,
            title,
            body,
            channels,
            targeting: targeting.details,
            audience: targeting.audience,
            recipients: targeting.recipients,
            schedule: schedule_time || "immediate",
            messages,
          },
          validation: {
            valid: validationErrors.length === 0,
            errors: validationErrors,
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

        const { name, title, body, schedule_time, dry_run, test_mode } = args as {
          name: string;
          title: string;
          body: string;
          schedule_time?: string;
          dry_run?: boolean;
          test_mode?: boolean;
        };

        const targeting = await buildAudienceAndRecipients(args);
        if (targeting.errors.length > 0 && !dry_run && !test_mode) {
          return JSON.stringify({ error: "Targeting errors", details: targeting.errors });
        }

        // Store for audit trail in DB (not sent to Braze)
        const channels = (args.channels as string[]) || ["push"];
        const triggerProperties = {
          title,
          body,
          channels,
          iam_type: args.iam_type || null,
          iam_header: args.iam_header || null,
          iam_body: args.iam_body || null,
          campaign_name: name,
          sent_by: "copilot",
        };

        // Generate unique send_id for traceability
        const sendId = `copilot-${name.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}-${Date.now()}`;

        // Build Braze /messages/send payload with messaging objects
        const { messages } = buildMessagesObject(args, name);
        const brazePayload: Record<string, unknown> = {
          send_id: sendId,
          messages,
        };

        // Test mode: override all targeting to send only to test user
        if (test_mode) {
          delete brazePayload.audience;
          brazePayload.recipients = [{ external_user_id: "874810", send_to_existing_only: true }];
        } else {
          if (targeting.audience) {
            brazePayload.audience = targeting.audience;
          }
          if (targeting.recipients.length > 0) {
            brazePayload.recipients = targeting.recipients;
          }
        if (targeting.segment_id && !targeting.audience) {
            brazePayload.segment_id = targeting.segment_id;
          }
          // broadcast:true required by Braze when using segment_id without recipients
          if (targeting.segment_id && targeting.recipients.length === 0) {
            brazePayload.broadcast = true;
          }
        }

        const segmentFilter = {
          ...targeting.details,
          audience: targeting.audience,
          recipients: targeting.recipients,
          dry_run: dry_run || false,
          test_mode: test_mode || false,
        };

        // DRY RUN: log and return payload without calling Braze
        if (dry_run) {
          await serviceClient.from("copilot_campaigns").insert({
            name: `[DRY RUN] ${name}`,
            status: "dry_run",
            segment_filter: segmentFilter,
            trigger_properties: triggerProperties,
            scheduled_at: schedule_time && schedule_time !== "now" ? schedule_time : null,
            created_by: userId,
            send_id: sendId,
          });

          await serviceClient.from("scheduler_logs").insert({
            function_name: "growth-copilot",
            action: "campaign_dry_run",
            reason: `Dry run for campaign "${name}"`,
            details: { campaign_name: name, ...targeting.details },
          });

          return JSON.stringify({
            success: true,
            type: "dry_run",
            send_id: sendId,
            message: `DRY RUN — no notifications were sent. Channels: ${channels.join(", ")}. The payload below shows the exact messaging objects that would be delivered.`,
            braze_payload: brazePayload,
            schedule: schedule_time || "immediate",
            targeting_details: targeting.details,
          });
        }

        // Log test_mode in scheduler logs
        const modeLabel = test_mode ? "test_mode" : "full";

        if (schedule_time && schedule_time !== "now") {
          const brazeRes = await fetch(
            `${BRAZE_REST_ENDPOINT}/messages/schedule/create`,
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
            await serviceClient.from("copilot_campaigns").insert({
              name,
              status: "error",
              segment_filter: segmentFilter,
              trigger_properties: triggerProperties,
              scheduled_at: schedule_time,
              created_by: userId,
              send_id: sendId,
            });
            return JSON.stringify({ error: "Braze API error", details: brazeData });
          }

          const nameWithMode = test_mode ? `[TEST] ${name}` : name;
          await serviceClient.from("copilot_campaigns").insert({
            name: nameWithMode,
            status: "sent",
            segment_filter: segmentFilter,
            trigger_properties: triggerProperties,
            braze_dispatch_id: brazeData.dispatch_id,
            scheduled_at: schedule_time,
            sent_at: new Date().toISOString(),
            created_by: userId,
            send_id: sendId,
          });

          await serviceClient.from("scheduler_logs").insert({
            function_name: "growth-copilot",
            action: `campaign_scheduled_${modeLabel}`,
            reason: `Scheduled ${modeLabel} campaign "${name}" for ${schedule_time}`,
            details: { campaign_name: name, mode: modeLabel, send_id: sendId, ...targeting.details, dispatch_id: brazeData.dispatch_id },
          });

          return JSON.stringify({
            success: true,
            type: "scheduled",
            mode: modeLabel,
            send_id: sendId,
            dispatch_id: brazeData.dispatch_id,
            scheduled_for: schedule_time,
            ...(test_mode ? { note: "TEST MODE: sent only to test user 874810" } : {}),
          });
        } else {
          const brazeRes = await fetch(
            `${BRAZE_REST_ENDPOINT}/messages/send`,
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
              segment_filter: segmentFilter,
              trigger_properties: triggerProperties,
              created_by: userId,
              send_id: sendId,
            });
            return JSON.stringify({ error: "Braze API error", details: brazeData });
          }

          const nameWithMode2 = test_mode ? `[TEST] ${name}` : name;
          await serviceClient.from("copilot_campaigns").insert({
            name: nameWithMode2,
            status: "sent",
            segment_filter: segmentFilter,
            trigger_properties: triggerProperties,
            braze_dispatch_id: brazeData.dispatch_id,
            sent_at: new Date().toISOString(),
            created_by: userId,
            send_id: sendId,
          });

          await serviceClient.from("scheduler_logs").insert({
            function_name: "growth-copilot",
            action: `campaign_sent_${modeLabel}`,
            reason: `Sent ${modeLabel} campaign "${name}" immediately`,
            details: { campaign_name: name, mode: modeLabel, send_id: sendId, ...targeting.details, dispatch_id: brazeData.dispatch_id },
          });

          return JSON.stringify({
            success: true,
            type: "immediate",
            mode: modeLabel,
            send_id: sendId,
            dispatch_id: brazeData.dispatch_id,
            ...(test_mode ? { note: "TEST MODE: sent only to test user 874810" } : {}),
          });
        }
      }

      case "list_braze_segments": {
        const page = (args.page as number) || 0;
        const url = `${BRAZE_REST_ENDPOINT}/segments/list?page=${page}&sort_direction=desc`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${BRAZE_API_KEY}` },
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Braze API error ${res.status}: ${errBody}`);
        }
        const data = await res.json();
        const segments = (data.segments || []).map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          analytics_tracking_enabled: s.analytics_tracking_enabled,
          tags: s.tags,
        }));
        return JSON.stringify({
          segments,
          count: segments.length,
          page,
          message: data.message,
        });
      }

      case "get_segment_details": {
        const segmentId = args.segment_id as string;
        const url = `${BRAZE_REST_ENDPOINT}/segments/details?segment_id=${segmentId}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${BRAZE_API_KEY}` },
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Braze API error ${res.status}: ${errBody}`);
        }
        const data = await res.json();
        return JSON.stringify({
          segment_id: segmentId,
          name: data.name,
          description: data.description,
          estimated_size: data.size,
          tags: data.tags,
          created_at: data.created_at,
          updated_at: data.updated_at,
          analytics_tracking_enabled: data.analytics_tracking_enabled,
        });
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

      case "optimize_bidi": {
        const text = args.text as string;
        const ltrTokens = (args.ltr_tokens as string[]) || [];
        const maxLength = (args.max_length as number) || 140;

        // Use the AI model itself to apply BiDi optimization
        const bidiPrompt = `You are a BiDi-safe copy generator for Braze push notifications (plain text, no HTML).
Your job: take the Arabic sentence (which may include English words, numbers, domains, coupon codes, or Liquid variables) and output a Braze-ready line that renders correctly in mixed RTL/LTR on iOS and Android.

RULES (Embedding method):
1. Start the entire sentence with RLE (U+202B).
2. Wrap EVERY LTR "island" (any Latin-script token, number, URL, coupon code, or Liquid variable likely to resolve to Latin/digits) with LRE (U+202A) … PDF (U+202C).
3. Example islands: Kabul, 1001, 1001.tv, {{coupon_code}}, {{first_name}} if it may be Latin.
4. Keep normal spaces OUTSIDE the LRE/PDF wrappers.
5. Keep punctuation inside the surrounding RTL span; end the whole sentence with a closing PDF (U+202C).
6. Output MUST be plain text with the ACTUAL invisible Unicode marks (not \\u escapes, not HTML).
7. Limit to max ${maxLength} characters unless the input is already shorter.

OUTPUT FORMAT (exactly two lines, no other text):
Line 1: Braze-ready final string with real control characters embedded.
Line 2: Annotated QA version where each invisible mark is replaced by tags [RLE], [LRE], [PDF] so humans can verify placement.

${ltrTokens.length > 0 ? `Known LTR tokens: ${ltrTokens.join(", ")}` : ""}

Process this text: ${text}`;

        const bidiRes = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "user", content: bidiPrompt }],
              temperature: 0.1,
            }),
          }
        );

        if (!bidiRes.ok) {
          throw new Error(`BiDi optimization failed: ${bidiRes.status}`);
        }

        const bidiData = await bidiRes.json();
        const bidiOutput = bidiData.choices?.[0]?.message?.content || "";
        const lines = bidiOutput.trim().split("\n").filter((l: string) => l.trim());

        return JSON.stringify({
          original: text,
          braze_ready: lines[0] || text,
          annotated_qa: lines[1] || "(no QA annotation)",
          note: "The braze_ready string contains invisible Unicode directional marks (RLE/LRE/PDF). Use this in the push payload. The annotated_qa version shows where each mark is placed.",
        });
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
        continue;
      }

      // No tool calls — we have the final response
      const finalContent = assistantMessage.content || "";

      if (session_id) {
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
