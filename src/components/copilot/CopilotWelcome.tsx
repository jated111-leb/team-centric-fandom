import { Bot, HelpCircle, ShieldCheck } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface CopilotWelcomeProps {
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  "Show me all available segments",
  "Do a dry run campaign for Al Hilal fans",
  "Send a push to Al Hilal fans about their next match",
  "Target the 'Weekly Active Users' segment where push is opted in",
  "What campaigns have been sent recently?",
];

export function CopilotWelcome({ onSuggestionClick }: CopilotWelcomeProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-6 py-12 max-w-2xl mx-auto">
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold mb-2">Welcome to Growth Copilot</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Create and send Braze push campaigns using natural language. Try one of the prompts below or ask anything.
        </p>
      </div>

      {/* Suggestion prompts */}
      <div className="grid gap-2 max-w-lg w-full">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestionClick(suggestion)}
            className="text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>

      {/* FAQ / How-to Section */}
      <div className="w-full max-w-lg mt-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
          <HelpCircle className="h-4 w-4" />
          <span>How to use the Copilot</span>
        </div>
        <Accordion type="multiple" defaultValue={["safe-testing"]} className="w-full text-left">

          {/* Safe Testing */}
          <AccordionItem value="safe-testing">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Safe testing workflow
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Test campaigns safely before sending to real audiences:</p>
              <ol className="list-decimal pl-4 space-y-2">
                <li>
                  <strong className="text-foreground">Dry Run</strong> — ask the copilot to do a dry run. It builds the full Braze payload, validates targeting, and shows you exactly what <em>would</em> be sent — without sending anything.
                </li>
                <li>
                  <strong className="text-foreground">Test Mode</strong> — ask the copilot to send in test mode. It sends a real push but <em>only</em> to the test account (user 874810) so you can verify the notification arrives.
                </li>
                <li>
                  <strong className="text-foreground">Full Send</strong> — only after verifying with dry run and test mode, confirm a full send to the real audience.
                </li>
              </ol>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 Try: <em>"Do a dry run campaign for Al Hilal fans saying Match tonight!"</em> → see the payload → <em>"Now send in test mode"</em> → verify push arrives → <em>"OK send for real"</em>
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Segments */}
          <AccordionItem value="segments">
            <AccordionTrigger className="text-sm">Finding & using segments</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>The copilot connects to your Braze account in real time. You can:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Browse segments</strong> — say <em>"Show me all available segments"</em> and the copilot will list every segment with its name and ID.</li>
                <li><strong className="text-foreground">Search by name</strong> — say <em>"Find segments related to lapsed users"</em> and the copilot will filter matching results.</li>
                <li><strong className="text-foreground">Target a segment</strong> — mention a segment name (e.g. <em>"target the Weekly Active Users segment"</em>) and the copilot will look up the ID automatically.</li>
                <li><strong className="text-foreground">Audience sizing</strong> — when you pick a segment, the copilot fetches the estimated audience size so you know how many users you'll reach <em>before</em> you confirm.</li>
              </ul>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 Example: <em>"Send a push to the 'Matchday Enthusiasts' segment"</em> → copilot looks up segment → shows ~25,000 users → you confirm.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Filters & Conditions */}
          <AccordionItem value="filters">
            <AccordionTrigger className="text-sm">Filters & conditions</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Describe filters in plain English and the copilot translates them to Braze's API format:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Custom attributes</strong> — equals, not equals, matches regex, exists, includes value, etc. <em>"users where favourite_team is Al Hilal"</em></li>
                <li><strong className="text-foreground">Push subscription</strong> — opted in, subscribed, unsubscribed. <em>"only users with push opted in"</em></li>
                <li><strong className="text-foreground">Email subscription</strong> — subscribed, opted in, unsubscribed.</li>
                <li><strong className="text-foreground">AND / OR logic</strong> — combine any filters. <em>"favourite_team is Al Hilal AND push is opted in"</em></li>
              </ul>
              <p className="font-medium text-foreground mt-3">Recipe: Segment + filter</p>
              <p>You can layer filters on top of a segment to narrow the audience:</p>
              <p className="text-xs border-l-2 border-primary/30 pl-2">
                💡 <em>"Target the 'All Registered Users' segment but only where language is Arabic AND push is opted in"</em> — the copilot will show you the segment size first, then note that filters will narrow it further.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Campaign Design & Audience Sizing */}
          <AccordionItem value="workflow">
            <AccordionTrigger className="text-sm">Campaign design & audience sizing</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Every campaign follows a safe <strong className="text-foreground">3-step process</strong>:</p>
              <ol className="list-decimal pl-4 space-y-2">
                <li>
                  <strong className="text-foreground">Describe</strong> — tell the copilot what you want to send and to whom.
                </li>
                <li>
                  <strong className="text-foreground">Preview with audience size</strong> — the copilot validates your inputs and shows a preview card with:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li>Push title & body</li>
                    <li>Targeting details (segment, filters, teams)</li>
                    <li><strong className="text-foreground">Estimated audience size</strong> — fetched live from Braze so you know exactly how many users will receive the push</li>
                    <li>Schedule (immediate or future time)</li>
                  </ul>
                </li>
                <li>
                  <strong className="text-foreground">Confirm</strong> — only after you approve does it call the Braze API. Nothing is sent without your explicit "yes".
                </li>
              </ol>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 If the audience size looks too large or too small, you can adjust filters before confirming. Say <em>"add a filter for push opted in"</em> to narrow down.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Scheduling & Timezone */}
          <AccordionItem value="scheduling">
            <AccordionTrigger className="text-sm">Scheduling & timezone</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>You can send immediately or schedule for a future time:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Immediate</strong> — just describe the campaign and confirm. It fires right away.</li>
                <li><strong className="text-foreground">Scheduled</strong> — include a time in your prompt using natural language:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li><em>"Schedule for tomorrow at 7pm"</em></li>
                    <li><em>"Send in 2 hours"</em></li>
                  </ul>
                </li>
              </ul>
              <p className="font-medium text-foreground mt-3">Default timezone: Baghdad (UTC+3)</p>
              <p>All times are interpreted as <strong className="text-foreground">Asia/Baghdad</strong> unless you specify otherwise. The copilot converts to UTC automatically for Braze.</p>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 <em>"Send at 7pm"</em> → interpreted as 7:00 PM Baghdad → scheduled for 4:00 PM UTC. Both times shown in the preview.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Channels: Push & IAM */}
          <AccordionItem value="channels">
            <AccordionTrigger className="text-sm">Channels: Push & In-App Messages</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>The copilot supports two delivery channels — use them alone or together:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Push notifications</strong> — default channel. Delivered to both iOS and Android.</li>
                <li><strong className="text-foreground">In-App Messages (IAM)</strong> — displayed when the user next opens the app. Three types:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">
                    <li><strong className="text-foreground">Slideup</strong> — say <em>"tooltip"</em>, <em>"toast"</em>, or <em>"slide-up"</em></li>
                    <li><strong className="text-foreground">Modal</strong> — say <em>"popup"</em>, <em>"dialog"</em>, or <em>"overlay"</em></li>
                    <li><strong className="text-foreground">Full</strong> — say <em>"takeover"</em> or <em>"full screen"</em></li>
                  </ul>
                </li>
              </ul>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 <em>"Send a push and a tooltip to Al Hilal fans"</em> → delivers both a push notification AND a slideup IAM in one campaign.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Rich Push Images */}
          <AccordionItem value="images">
            <AccordionTrigger className="text-sm">Rich push images</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Attach an image to your push notification using the 📷 button next to the input:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Formats</strong> — JPEG, PNG, or GIF (GIF animates on iOS only)</li>
                <li><strong className="text-foreground">Size</strong> — under 10 MB (recommended under 5 MB)</li>
                <li><strong className="text-foreground">Dimensions</strong> — at least 600×300px, 2:1 aspect ratio recommended for Android</li>
                <li><strong className="text-foreground">iOS</strong> — shows as an expanded rich notification (up to 1038×1038)</li>
                <li><strong className="text-foreground">Android</strong> — shows as a "Big Picture" expanded notification</li>
              </ul>
              <p>The upload validates your image against these guidelines and warns you if anything is off before sending.</p>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 Attach an image → type your campaign → the copilot automatically includes it in the push payload for both platforms.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Targeting methods */}
          <AccordionItem value="targeting">
            <AccordionTrigger className="text-sm">All targeting methods</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Four targeting methods — use them alone or combine:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Team shorthand</strong> — mention a team name (e.g. "Al Hilal fans") and it auto-targets users with that favourite_team attribute.</li>
                <li><strong className="text-foreground">Braze Segments</strong> — reference any saved segment by name or ID.</li>
                <li><strong className="text-foreground">Custom attribute filters</strong> — any Braze custom attribute with AND/OR logic.</li>
                <li><strong className="text-foreground">Individual users</strong> — target specific external user IDs for testing.</li>
              </ul>
              <p className="font-medium text-foreground mt-3">Combining methods</p>
              <p className="text-xs border-l-2 border-primary/30 pl-2">
                💡 <em>"Target the 'Weekly Active Users' segment, add a filter for favourite_team equals Al Ahli, and also include user_123 for testing"</em> — all three methods combined in one send.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Device Targeting */}
          <AccordionItem value="device-targeting">
            <AccordionTrigger className="text-sm">Device targeting</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>By default, push notifications are sent to <strong className="text-foreground">all devices</strong> registered to each user. You can change this:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">All devices (default)</strong> — a user with both an iPhone and an Android phone will receive the push on both.</li>
                <li><strong className="text-foreground">Most recent device only</strong> — sends only to the last device the user was active on. Useful to avoid annoying multi-device spam.</li>
              </ul>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 To enable it, just say <em>"send to most recent device only"</em> in your prompt. Example: <em>"Send a push to Al Hilal fans about the match, most recent device only"</em>
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* BiDi Optimization */}
          <AccordionItem value="bidi">
            <AccordionTrigger className="text-sm">Arabic BiDi text optimization</AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              <p>Mixed Arabic + English text often renders incorrectly in Braze push notifications due to bidirectional (BiDi) issues. The copilot fixes this automatically:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Auto-detection</strong> — when your push text contains Arabic mixed with English words, numbers, URLs, or Liquid variables, the copilot applies BiDi optimization.</li>
                <li><strong className="text-foreground">Unicode marks</strong> — embeds invisible RLE/LRE/PDF directional marks so text renders correctly on both iOS and Android.</li>
                <li><strong className="text-foreground">QA view</strong> — shows an annotated version with visible <code>[RLE]</code>, <code>[LRE]</code>, <code>[PDF]</code> tags so you can verify mark placement before sending.</li>
              </ul>
              <p className="text-xs mt-2 border-l-2 border-primary/30 pl-2">
                💡 Just write your Arabic text naturally — the copilot handles the rest. Example: <em>"شجع فريقك على 1001.tv"</em> → auto-wrapped with directional marks for correct rendering.
              </p>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </div>
    </div>
  );
}
