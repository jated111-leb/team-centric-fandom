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
            <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] text-white font-bold" style={{ background: "#1C2128", border: "2px solid #0D1117" }}>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "#2ECC71" }} />
              👤
            </div>
          ))}
        </div>
        <span className="text-[11px]" style={{ color: "#8B949E" }}>3 أصدقاء يشاهدون</span>
      </div>

      {/* Reaction Bar */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" style={{ direction: "ltr" }}>
        {reactions.map((r, i) => (
          <button
            key={r.label}
            onClick={() => handleReaction(i)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full flex-shrink-0 text-xs active:scale-95 transition-transform"
            style={{ background: "#1C2128" }}
          >
            <span>{r.emoji}</span>
            <span style={{ color: "#8B949E" }}>{r.count}</span>
          </button>
        ))}
      </div>

      {/* Live Chat */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#161B22" }}>
        <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid #1C2128" }}>
          <span className="text-white text-sm font-bold">الدردشة</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#E74C3C", color: "#fff" }}>🔴 LIVE</span>
        </div>
        <div ref={chatRef} className="h-48 overflow-y-auto p-3 space-y-2" style={{ direction: "rtl" }}>
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] text-white font-bold" style={{ background: "#1C2128" }}>
                {msg.username[0]}
              </div>
              <div>
                <span className="text-[10px] font-bold" style={{ color: "#2ECC71" }}>{msg.username}</span>
                <span className="text-[9px] mr-2" style={{ color: "#8B949E" }}>{msg.timestamp}</span>
                <p className="text-white text-xs">{msg.message}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 p-2" style={{ borderTop: "1px solid #1C2128", direction: "rtl" }}>
          <input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="اكتب رسالة..."
            className="flex-1 text-xs text-white px-3 py-2 rounded-full border-0 outline-none placeholder:text-gray-500"
            style={{ background: "#1C2128" }}
          />
          <button onClick={sendMessage} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#2ECC71" }}>
            <Send size={14} color="#fff" />
          </button>
        </div>
      </div>

      {/* Timed Quiz */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-bold">من سجّل الهدف؟ ⚽</span>
          {!quizAnswered && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#E74C3C", color: "#fff" }}>10 ث</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quizOptions.map((opt, i) => {
            let bg = "#1C2128";
            let textColor = "#8B949E";
            if (quizAnswered) {
              if (i === correctAnswer) { bg = "#2ECC71"; textColor = "#fff"; }
              else if (i === quizSelected) { bg = "#E74C3C"; textColor = "#fff"; }
            } else if (i === quizSelected) { bg = "#2ECC71"; textColor = "#fff"; }
            return (
              <button
                key={i}
                onClick={() => { setQuizSelected(i); setQuizAnswered(true); }}
                disabled={quizAnswered}
                className="py-2.5 rounded-xl text-xs font-medium transition-all"
                style={{ background: bg, color: textColor }}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {quizAnswered && quizSelected === correctAnswer && (
          <p className="text-center text-xs mt-2" style={{ color: "#2ECC71" }}>🎉 إجابة صحيحة! +10 نقاط</p>
        )}
      </div>

      {/* Event Feed */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white text-sm font-bold mb-3">أحداث المباراة</h3>
        <div className="space-y-2">
          {mockMatchEvents.map((event, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5" style={{ borderBottom: i < mockMatchEvents.length - 1 ? "1px solid #1C2128" : "none" }}>
              <span className="text-xs font-mono w-12 text-left" style={{ color: "#8B949E" }}>{event.minute}</span>
              <span className="text-sm">{event.icon}</span>
              <span className="text-white text-xs flex-1">{event.player}</span>
              <span className="text-[10px]" style={{ color: event.team === "A" ? "#2ECC71" : "#F39C12" }}>
                {event.team === "A" ? "🇮🇶" : "🇸🇦"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#161B22" }}>
        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <span className="text-white text-sm font-bold">التصنيف</span>
          {showLeaderboard ? <ChevronUp size={16} color="#8B949E" /> : <ChevronDown size={16} color="#8B949E" />}
        </button>
        {showLeaderboard && (
          <div className="px-4 pb-3 space-y-1.5">
            {mockLeaderboard.map((user) => (
              <div
                key={user.rank}
                className="flex items-center gap-3 py-1.5 px-2 rounded-lg"
                style={{ background: user.isCurrentUser ? "rgba(46,204,113,0.15)" : "transparent" }}
              >
                <span className="text-xs font-bold w-5" style={{ color: user.rank <= 3 ? "#F39C12" : "#8B949E" }}>
                  {user.rank}
                </span>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] text-white font-bold" style={{ background: "#1C2128" }}>
                  {user.username[0]}
                </div>
                <span className="text-white text-xs flex-1" style={{ fontWeight: user.isCurrentUser ? 700 : 400 }}>
                  {user.username} {user.isCurrentUser && "(أنت)"}
                </span>
                <span className="text-xs font-mono" style={{ color: "#2ECC71" }}>{user.points}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InGame;
