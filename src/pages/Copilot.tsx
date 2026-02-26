import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Send, Sparkles, Bot, User, Loader2, HelpCircle } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Copilot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("growth-copilot", {
        body: {
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          session_id: sessionId,
        },
      });

      if (error) {
        console.error("Copilot error:", error);
        toast.error("Failed to get response");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content || "No response" },
      ]);
    } catch (err) {
      console.error("Copilot error:", err);
      toast.error("Failed to connect to copilot");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Growth Copilot</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered campaign builder for Braze push notifications
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 && (
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
            <div className="grid gap-2 max-w-lg w-full">
              {[
                "Send a push to Al Hilal fans about their next match",
                "Target segment 'Weekly Active Users' with a Ramadan promo",
                "Send to users where favourite_team is Al Ahli AND push is opted in",
                "What campaigns have been sent recently?",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* FAQ Section */}
            <div className="w-full max-w-lg mt-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                <HelpCircle className="h-4 w-4" />
                <span>How to use the Copilot</span>
              </div>
              <Accordion type="multiple" className="w-full text-left">
                <AccordionItem value="targeting">
                  <AccordionTrigger className="text-sm">What audience targeting can I use?</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground space-y-2">
                    <p>You can target audiences in four ways — alone or combined:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong className="text-foreground">Team shorthand</strong> — mention a team name (e.g. "Al Hilal fans") and it auto-targets users with that favourite_team attribute.</li>
                      <li><strong className="text-foreground">Braze Segments</strong> — reference any saved segment from your Braze account by name or ID (e.g. "target the 'Weekly Active Users' segment").</li>
                      <li><strong className="text-foreground">Custom attribute filters</strong> — add any Braze custom attribute filter with AND/OR logic (e.g. "users where league_preference includes La Liga AND push is opted in").</li>
                      <li><strong className="text-foreground">Individual users</strong> — target specific external user IDs for testing or one-off sends.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="filters">
                  <AccordionTrigger className="text-sm">What filters and conditions are supported?</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground space-y-2">
                    <p>You can describe filters in plain English and the copilot translates them to Braze's API format:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong className="text-foreground">Custom attributes</strong> — equals, not equals, matches regex, exists, includes value, etc.</li>
                      <li><strong className="text-foreground">Push subscription</strong> — opted in, subscribed, unsubscribed.</li>
                      <li><strong className="text-foreground">Email subscription</strong> — subscribed, opted in, unsubscribed.</li>
                      <li><strong className="text-foreground">Combinations</strong> — AND/OR logic across any of the above.</li>
                    </ul>
                    <p>Example: <em>"Target users where favourite_team is Al Hilal AND push_subscription is opted_in"</em></p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="workflow">
                  <AccordionTrigger className="text-sm">What's the send workflow?</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground space-y-2">
                    <p>Every campaign follows a safe 3-step process:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li><strong className="text-foreground">Describe</strong> — tell the copilot what you want to send and to whom.</li>
                      <li><strong className="text-foreground">Preview</strong> — the copilot validates your inputs and shows a preview card with the exact targeting, message, and schedule.</li>
                      <li><strong className="text-foreground">Confirm</strong> — only after you approve does it actually call the Braze API.</li>
                    </ol>
                    <p>You can also schedule sends for a future time using ISO 8601 or natural language (e.g. "tomorrow at 7pm GST").</p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="examples">
                  <AccordionTrigger className="text-sm">Example prompts</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground space-y-2">
                    <ul className="list-disc pl-4 space-y-1">
                      <li>"Send a push to the 'Lapsed Users' segment with title 'We miss you!' and body 'Check out tonight's matches'"</li>
                      <li>"Target Al Hilal fans who have push opted in with a match reminder"</li>
                      <li>"Schedule a Ramadan campaign for tomorrow at 7pm targeting all users where language is Arabic"</li>
                      <li>"Send to external user IDs user_123 and user_456 for testing"</li>
                      <li>"Show me the last 5 campaigns sent from copilot"</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        )}

        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <Card
                className={`max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-foreground"
                }`}
              >
                <CardContent className="p-3">
                  <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                </CardContent>
              </Card>
              {msg.role === "user" && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-4 w-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <Card className="bg-muted/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the campaign you want to send..."
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Copilot;
