import { useState, useRef, useEffect } from "react";
import { Send, ChevronDown, ChevronUp } from "lucide-react";
import { mockLiveChatMessages, mockMatchEvents, mockLeaderboard, mockReactions as initialReactions } from "@/lib/worldcupMockData";

const InGame = () => {
  const [messages, setMessages] = useState(mockLiveChatMessages);
  const [newMsg, setNewMsg] = useState("");
  const [reactions, setReactions] = useState(initialReactions.map(r => ({ ...r, count: Math.floor(Math.random() * 200) + 50 })));
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!newMsg.trim()) return;
    setMessages((prev) => [...prev, { id: Date.now().toString(), username: "أنت", message: newMsg, timestamp: "الآن" }]);
    setNewMsg("");
  };

  const handleReaction = (idx: number) => {
    setReactions((prev) => prev.map((r, i) => i === idx ? { ...r, count: r.count + 1 } : r));
  };

  const quizOptions = ["أيمن حسين", "علاء عباس", "محند علي", "أمجد عطوان"];
  const correctAnswer = 0;

  return (
    <div className="flex flex-col px-4 pb-4 gap-4" style={{ minHeight: "calc(100vh - 300px)" }}>
      {/* Friends Watching */}
      <div className="flex items-center gap-2 py-2">
        <div className="flex -space-x-2" style={{ direction: "ltr" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] text-wc-text font-bold bg-wc-elevated border-2 border-wc-bg relative">
              👤
            </div>
          ))}
        </div>
        <span className="text-[11px] text-wc-muted">3 أصدقاء يشاهدون</span>
      </div>

      {/* Reaction Bar */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ direction: "ltr" }}>
        {reactions.map((r, i) => (
          <button
            key={r.label}
            onClick={() => handleReaction(i)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full flex-shrink-0 text-xs active:scale-95 transition-transform bg-wc-elevated border border-wc-border"
          >
            <span>{r.emoji}</span>
            <span className="text-wc-muted">{r.count}</span>
          </button>
        ))}
      </div>

      {/* Live Chat */}
      <div className="rounded-2xl overflow-hidden bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-between px-4 py-2 border-b border-wc-border">
          <span className="text-wc-text text-sm font-bold">الدردشة</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-wc-danger text-wc-accent-foreground">🔴 LIVE</span>
        </div>
        <div ref={chatRef} className="h-48 overflow-y-auto p-3 space-y-2" style={{ direction: "rtl" }}>
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] text-wc-text font-bold bg-wc-elevated">
                {msg.username[0]}
              </div>
              <div>
                <span className="text-[10px] font-bold text-wc-accent">{msg.username}</span>
                <span className="text-[9px] mr-2 text-wc-muted">{msg.timestamp}</span>
                <p className="text-wc-text text-xs">{msg.message}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-2 border-t border-wc-border" style={{ direction: "rtl" }}>
          <input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="اكتب رسالة..."
            className="flex-1 text-xs text-wc-text px-3 py-2 rounded-full border-0 outline-none bg-wc-elevated placeholder:text-wc-muted"
          />
          <button onClick={sendMessage} className="w-8 h-8 rounded-full flex items-center justify-center bg-wc-accent">
            <Send size={14} className="text-wc-accent-foreground" />
          </button>
        </div>
      </div>

      {/* Timed Quiz */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-between mb-3">
          <span className="text-wc-text text-sm font-bold">من سجّل الهدف؟ ⚽</span>
          {!quizAnswered && <span className="text-xs px-2 py-0.5 rounded-full bg-wc-danger text-wc-accent-foreground">10 ث</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quizOptions.map((opt, i) => {
            let classes = "bg-wc-elevated text-wc-muted";
            if (quizAnswered) {
              if (i === correctAnswer) classes = "bg-wc-accent text-wc-accent-foreground";
              else if (i === quizSelected) classes = "bg-wc-danger text-wc-accent-foreground";
            } else if (i === quizSelected) {
              classes = "bg-wc-accent text-wc-accent-foreground";
            }
            return (
              <button
                key={i}
                onClick={() => { setQuizSelected(i); setQuizAnswered(true); }}
                disabled={quizAnswered}
                className={`py-2.5 rounded-full text-xs font-medium transition-all ${classes}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {quizAnswered && quizSelected === correctAnswer && (
          <p className="text-center text-xs mt-2 text-wc-accent">🎉 إجابة صحيحة! +10 نقاط</p>
        )}
      </div>

      {/* Event Feed */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text text-sm font-bold mb-3">أحداث المباراة</h3>
        <div className="space-y-2">
          {mockMatchEvents.map((event, i) => (
            <div key={i} className={`flex items-center gap-3 py-1.5 ${i < mockMatchEvents.length - 1 ? "border-b border-wc-border" : ""}`}>
              <span className="text-xs font-mono w-12 text-left text-wc-muted">{event.minute}</span>
              <span className="text-sm">{event.icon}</span>
              <span className="text-wc-text text-xs flex-1">{event.player}</span>
              <span className="text-[10px]">
                {event.team === "A" ? "🇮🇶" : "🇩🇪"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl overflow-hidden bg-wc-surface border border-wc-border">
        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <span className="text-wc-text text-sm font-bold">التصنيف</span>
          {showLeaderboard ? <ChevronUp size={16} className="text-wc-muted" /> : <ChevronDown size={16} className="text-wc-muted" />}
        </button>
        {showLeaderboard && (
          <div className="px-4 pb-3 space-y-1.5">
            {mockLeaderboard.map((user) => (
              <div
                key={user.rank}
                className={`flex items-center gap-3 py-1.5 px-2 rounded-lg ${user.isCurrentUser ? "bg-wc-accent/15" : ""}`}
              >
                <span className={`text-xs font-bold w-5 ${user.rank <= 3 ? "text-wc-warning" : "text-wc-muted"}`}>
                  {user.rank}
                </span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] text-wc-text font-bold bg-wc-elevated">
                  {user.username[0]}
                </div>
                <span className={`text-wc-text text-xs flex-1 ${user.isCurrentUser ? "font-bold" : ""}`}>
                  {user.username} {user.isCurrentUser && "(أنت)"}
                </span>
                <span className="text-xs font-mono text-wc-accent">{user.points}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InGame;
