import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Send, Sparkles, Bot, User, Loader2, Plus, History, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { CopilotWelcome } from "@/components/copilot/CopilotWelcome";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SessionSummary {
  session_id: string;
  first_message: string;
  created_at: string;
  message_count: number;
}

const Copilot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      // Get distinct sessions with their first user message and count
      const { data, error } = await supabase
        .from("copilot_messages")
        .select("session_id, content, role, created_at")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Failed to fetch sessions:", error);
        return;
      }

      if (!data || data.length === 0) {
        setSessions([]);
        return;
      }

      // Group by session_id
      const sessionMap = new Map<string, { first_message: string; created_at: string; count: number }>();
      for (const row of data) {
        const existing = sessionMap.get(row.session_id);
        if (!existing) {
          sessionMap.set(row.session_id, {
            first_message: row.role === "user" ? (row.content || "New chat") : "New chat",
            created_at: row.created_at,
            count: 1,
          });
        } else {
          existing.count++;
          // If we haven't found a user message yet, check this one
          if (existing.first_message === "New chat" && row.role === "user" && row.content) {
            existing.first_message = row.content;
          }
        }
      }

      const summaries: SessionSummary[] = Array.from(sessionMap.entries())
        .map(([sid, info]) => ({
          session_id: sid,
          first_message: info.first_message.slice(0, 80) + (info.first_message.length > 80 ? "…" : ""),
          created_at: info.created_at,
          message_count: info.count,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);

      setSessions(summaries);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadSession = async (sid: string) => {
    if (sid === sessionId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("copilot_messages")
        .select("role, content")
        .eq("session_id", sid)
        .order("created_at", { ascending: true });

      if (error) {
        toast.error("Failed to load session");
        return;
      }

      setSessionId(sid);
      setMessages(
        (data || [])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content || "" }))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const startNewChat = () => {
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setInput("");
  };

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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 48) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Growth Copilot</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered campaign builder for Braze push notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={startNewChat} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <DropdownMenu onOpenChange={(open) => open && fetchSessions()}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <History className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Chat History</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {loadingSessions ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading…
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No previous chats
                </div>
              ) : (
                <ScrollArea className="max-h-64">
                  {sessions.map((s) => (
                    <DropdownMenuItem
                      key={s.session_id}
                      onClick={() => loadSession(s.session_id)}
                      className={`flex items-start gap-2 py-2.5 cursor-pointer ${
                        s.session_id === sessionId ? "bg-accent" : ""
                      }`}
                    >
                      <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{s.first_message}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.created_at)} · {s.message_count} messages
                        </p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </ScrollArea>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
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
