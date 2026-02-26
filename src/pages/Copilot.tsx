import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Send, Sparkles, Bot, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CopilotWelcome } from "@/components/copilot/CopilotWelcome";

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
          <CopilotWelcome onSuggestionClick={(s) => setInput(s)} />
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
                    ? "bg-primary/20 text-foreground border-primary/30"
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
