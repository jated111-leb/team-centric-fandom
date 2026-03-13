import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Send, UserPlus, X, Play } from "lucide-react";
import MiniLeaderboard from "@/components/worldcup/MiniLeaderboard";
import UserStatsCard from "@/components/worldcup/UserStatsCard";
import {
  laligaQuizzes,
  LALIGA_LIVE_CHAT_MESSAGES,
  LALIGA_AUTO_MESSAGES,
  LALIGA_MOCK_REACTIONS,
  LALIGA_EVENT_CONFIG,
  type LaLigaQuiz,
} from "@/lib/laligaMockData";
import {
  getTotalPoints,
  getUserRank,
  getLeaderboard,
  addPoints,
  recordQuizAnswer,
  setUsername as storeSetUsername,
  getPlayerData,
  syncPointsToDb,
} from "@/lib/pointsStore";
import fedshiLogo from "@/assets/fedshi-logo.png";
import type { MatchData } from "@/pages/LaLiga";
import { toast } from "@/hooks/use-toast";

type EventType = "goal" | "yellow_card" | "halftime" | "var";

interface LaLigaInGameProps {
  match: MatchData;
  userId: string | null;
  username: string | null;
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  isSystem?: boolean;
  isUser?: boolean;
}

const USERNAME_COLORS = [
  "text-sky-400", "text-pink-400", "text-amber-400", "text-emerald-400",
  "text-violet-400", "text-orange-400", "text-cyan-400", "text-rose-400",
];
function getUsernameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

const LaLigaInGame = ({ match, userId, username }: LaLigaInGameProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    LALIGA_LIVE_CHAT_MESSAGES.map((m) => ({ ...m }))
  );
  const [newMsg, setNewMsg] = useState("");
  const [reactions, setReactions] = useState(
    LALIGA_MOCK_REACTIONS.map((r) => ({ ...r, count: Math.floor(Math.random() * 200) + 50 }))
  );
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventType | null>(null);
  const [userPoints, setUserPoints] = useState(() => getTotalPoints());
  const [chatUsername, setChatUsername] = useState<string | null>(
    () => username ?? getPlayerData().username
  );
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [hypeCount, setHypeCount] = useState(5842);
  const [hasTapped, setHasTapped] = useState(false);
  const [hypeExpanded, setHypeExpanded] = useState(true);

  const pinnedQuizzes = laligaQuizzes.filter((q) => q.phase === "live");
  const [pinnedQuizIndex, setPinnedQuizIndex] = useState(0);
  const [pinnedQuizSelected, setPinnedQuizSelected] = useState<number | null>(null);
  const [pinnedQuizAnswered, setPinnedQuizAnswered] = useState(false);
  const [quizExpanded, setQuizExpanded] = useState(true);
  const [hasNewQuiz, setHasNewQuiz] = useState(true);

  const currentPinnedQuiz = pinnedQuizzes[pinnedQuizIndex % pinnedQuizzes.length];
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      const msg = LALIGA_AUTO_MESSAGES[Math.floor(Math.random() * LALIGA_AUTO_MESSAGES.length)];
      setMessages((prev) => [...prev, { id: `auto-${Date.now()}`, ...msg, timestamp: "الآن" }]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setHypeCount((prev) => prev + Math.floor(Math.random() * 8) + 2);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeEvent) return;
    const t = setTimeout(() => setActiveEvent(null), 3000);
    return () => clearTimeout(t);
  }, [activeEvent]);

  const triggerEvent = (type: EventType) => {
    const cfg = LALIGA_EVENT_CONFIG[type];
    setActiveEvent(type);

    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        username: "النظام",
        message: `${cfg.emoji} ${type === "goal" ? "هدف!" : type === "yellow_card" ? "بطاقة صفراء" : type === "halftime" ? "استراحة" : "مراجعة VAR"}`,
        timestamp: "الآن",
        isSystem: true,
      },
    ]);

    cfg.floods.forEach((msg, i) => {
      setTimeout(() => {
        setMessages((prev) => [...prev, { id: `flood-${Date.now()}-${i}`, ...msg, timestamp: "الآن" }]);
      }, (i + 1) * 350);
    });

    if (type === "goal") {
      setReactions((prev) => prev.map((r) => ({ ...r, count: r.count + Math.floor(Math.random() * 60) + 20 })));
    }
  };

  const handleReaction = (idx: number) => {
    setReactions((prev) => prev.map((r, i) => (i === idx ? { ...r, count: r.count + 1 } : r)));
  };

  const sendMessage = () => {
    if (!chatUsername) {
      setShowNamePrompt(true);
      setTimeout(() => nameInputRef.current?.focus(), 50);
      return;
    }
    const text = newMsg.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: Date.now().toString(), username: chatUsername, message: text, timestamp: "الآن", isUser: true }]);
    setNewMsg("");
  };

  const confirmName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setChatUsername(trimmed);
    storeSetUsername(trimmed);
    setShowNamePrompt(false);
    setNameInput("");
  };

  const handleNextPinnedQuiz = () => {
    setPinnedQuizIndex((i) => i + 1);
    setPinnedQuizSelected(null);
    setPinnedQuizAnswered(false);
    setQuizExpanded(true);
    setHasNewQuiz(true);
  };

  const hypeFill = Math.min((hypeCount / 15000) * 100, 100);
  const hypeTier =
    hypeCount < 3000
      ? { label: "الجمهور يتحرك...", barClass: "bg-wc-accent" }
      : hypeCount < 8000
      ? { label: "الملعب يشتعل! 🔥", barClass: "bg-wc-warning" }
      : { label: "الليغا كلها معاك! 💥", barClass: "bg-wc-danger" };

  const renderPinnedHype = () => (
    <div className="px-3 py-2 border-b border-wc-border flex-shrink-0">
      {hypeExpanded ? (
        <div className="rounded-xl p-3 border border-wc-accent/30 bg-wc-accent/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-wc-text">🔥 حرارة الجمهور</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-wc-secondary">{hypeCount.toLocaleString("ar-EG")} مشجع</span>
              <button onClick={() => setHypeExpanded(false)} className="p-0.5 rounded-full hover:bg-wc-elevated"><ChevronUp size={12} className="text-wc-muted" /></button>
            </div>
          </div>
          <div className="h-2.5 rounded-full mb-2 overflow-hidden bg-wc-elevated">
            <div className={`h-full rounded-full transition-all duration-700 ${hypeTier.barClass}`} style={{ width: `${hypeFill}%` }} />
          </div>
          {!hasTapped ? (
            <button onClick={() => { setHasTapped(true); setHypeCount((prev) => prev + 1); }} className="w-full py-2 rounded-full font-bold text-wc-accent-foreground text-xs bg-wc-accent active:scale-95 transition-transform">
              أشعل الحماس 🔥
            </button>
          ) : (
            <div className="w-full py-2 rounded-full text-center text-[10px] font-bold bg-wc-elevated text-wc-accent border border-wc-accent">
              أنت من بين {hypeCount.toLocaleString("ar-EG")} مشجع ✅
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setHypeExpanded(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wc-accent/10 border border-wc-accent/30 hover:bg-wc-accent/15 transition-all">
          <span className="text-xs">🔥</span>
          <span className="text-xs font-bold text-wc-accent">{hypeCount.toLocaleString("ar-EG")} مشجع</span>
          <ChevronDown size={10} className="text-wc-muted" />
        </button>
      )}
    </div>
  );

  const renderPinnedQuiz = () => {
    if (!currentPinnedQuiz) return null;
    return (
      <div className="px-3 py-2 border-t border-wc-border flex-shrink-0">
        {quizExpanded ? (
          <div className="rounded-xl p-3 border border-wc-warning/30 bg-wc-warning/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-wc-text">🧠 اختبار المعرفة</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-wc-elevated text-wc-muted border border-wc-border">+{currentPinnedQuiz.points} نقطة</span>
                <button onClick={() => { setQuizExpanded(false); setHasNewQuiz(false); }} className="p-0.5 rounded-full hover:bg-wc-elevated"><ChevronDown size={12} className="text-wc-muted" /></button>
              </div>
            </div>
            <p className="text-wc-text text-[11px] mb-2 leading-relaxed">{currentPinnedQuiz.question}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {currentPinnedQuiz.options.map((opt, i) => {
                let cls = "bg-wc-elevated text-wc-muted";
                if (pinnedQuizAnswered) {
                  if (i === currentPinnedQuiz.correctIndex) cls = "bg-wc-accent text-wc-accent-foreground";
                  else if (i === pinnedQuizSelected) cls = "bg-wc-danger text-wc-accent-foreground";
                }
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (pinnedQuizAnswered) return;
                      setPinnedQuizSelected(i);
                      setPinnedQuizAnswered(true);
                      const correct = i === currentPinnedQuiz.correctIndex;
                      recordQuizAnswer(correct);
                      if (correct) {
                        const newTotal = addPoints(currentPinnedQuiz.points, "in-game-trivia");
                        setUserPoints(newTotal);
                        if (userId) syncPointsToDb(userId).then(() => {});
                      }
                    }}
                    disabled={pinnedQuizAnswered}
                    className={`py-2 rounded-full text-[10px] font-medium transition-all ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {pinnedQuizAnswered && (
              <div className="mt-1.5 flex items-center justify-between">
                <p className={`text-[10px] font-bold ${pinnedQuizSelected === currentPinnedQuiz.correctIndex ? "text-wc-accent" : "text-wc-danger"}`}>
                  {pinnedQuizSelected === currentPinnedQuiz.correctIndex
                    ? `🎉 صح! +${currentPinnedQuiz.points} نقطة`
                    : `❌ الإجابة: ${currentPinnedQuiz.options[currentPinnedQuiz.correctIndex]}`}
                </p>
                <button onClick={handleNextPinnedQuiz} className="text-[9px] text-wc-accent underline">التالي ›</button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setQuizExpanded(true)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
              pinnedQuizAnswered ? "bg-wc-elevated border border-wc-border" : "bg-wc-warning/10 border border-wc-warning/30 hover:bg-wc-warning/15"
            } transition-all`}
          >
            <span className="text-xs">🧠</span>
            <span className={`text-[10px] font-bold ${pinnedQuizAnswered ? "text-wc-muted" : "text-wc-warning"}`}>
              {pinnedQuizAnswered ? "تم الإجابة ✅" : "سؤال جديد!"}
            </span>
            <ChevronUp size={10} className="text-wc-muted" />
            {!pinnedQuizAnswered && hasNewQuiz && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-wc-danger animate-pulse" />
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col px-4 pb-4 gap-3">
      {/* ── Dummy Video Player ─────────────────────────────────── */}
      <button
        onClick={() => toast({ title: "البث المباشر سيتوفر قريباً", description: "شاهد المباراة مباشرة على فدشي" })}
        className="relative w-full rounded-2xl overflow-hidden bg-black border border-wc-border"
        style={{ aspectRatio: "16/9" }}
      >
        {/* Dark video placeholder */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <Play size={28} className="text-white ml-1" fill="white" />
          </div>
        </div>

        {/* Live badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(220,40,40,0.9)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] text-white font-bold">مباشر</span>
        </div>

        {/* فدشي watermark */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 opacity-60">
          <img src={fedshiLogo} alt="فدشي" className="h-4 w-auto rounded" />
          <span className="text-[9px] text-white font-bold">فدشي</span>
        </div>

        {/* Match info */}
        <div className="absolute bottom-3 right-3">
          <span className="text-[10px] text-white/70 font-medium">
            {match.home_team_arabic} × {match.away_team_arabic}
          </span>
        </div>
      </button>

      {/* Event buttons */}
      <div className="rounded-2xl p-3 bg-wc-surface border border-wc-border">
        <p className="text-[10px] text-wc-muted mb-2 text-center">جرّب أحداث المباراة المباشرة</p>
        <div className="flex gap-2">
          {(Object.entries(LALIGA_EVENT_CONFIG) as [EventType, (typeof LALIGA_EVENT_CONFIG)[EventType]][]).map(
            ([type, cfg]) => (
              <button
                key={type}
                onClick={() => triggerEvent(type)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all active:scale-95 bg-wc-elevated border border-wc-border"
              >
                <span className="text-xl">{cfg.emoji}</span>
                <span className="text-[9px] text-wc-muted font-medium">{cfg.label}</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Reactions */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5" style={{ direction: "ltr" }}>
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

      {/* Chat */}
      <div className="flex flex-col rounded-2xl overflow-hidden bg-wc-surface border border-wc-border relative" style={{ height: "480px" }}>
        {activeEvent && (
          <div
            className={`absolute top-11 left-2 right-2 z-10 rounded-xl px-4 py-2.5 text-center text-sm font-bold text-white ${LALIGA_EVENT_CONFIG[activeEvent].bannerClass}`}
            style={{ animation: "slideDown 0.25s ease" }}
          >
            {LALIGA_EVENT_CONFIG[activeEvent].emoji} حدث في المباراة!
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2.5 border-b border-wc-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-wc-text text-sm font-bold">الدردشة</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-wc-danger text-wc-accent-foreground">🔴 مباشر</span>
          </div>
          <button
            onClick={() => {
              const msg = encodeURIComponent(`${match.home_team_arabic} × ${match.away_team_arabic} — المباراة مباشرة! انضم\nhttps://team-centric-fandom.lovable.app/la-liga`);
              window.open(`https://wa.me/?text=${msg}`, "_blank");
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-wc-accent border border-wc-accent bg-wc-accent/10"
          >
            <UserPlus size={12} />
            <span>دعوة</span>
          </button>
        </div>

        {renderPinnedHype()}

        <div ref={chatRef} className="flex-1 min-h-0 overflow-y-auto py-2 px-3 space-y-1" style={{ direction: "rtl" }}>
          {messages.map((msg) =>
            msg.isSystem ? (
              <div key={msg.id} className="flex justify-center py-0.5">
                <span className="text-[10px] px-3 py-1 rounded-full bg-wc-elevated text-wc-muted">{msg.message}</span>
              </div>
            ) : (
              <div key={msg.id} className="flex items-baseline gap-1.5">
                <span className={`text-[10px] font-bold flex-shrink-0 ${msg.isUser ? "text-wc-accent" : getUsernameColor(msg.username)}`}>
                  {msg.username}
                </span>
                <span className="text-wc-text text-[11px] leading-snug break-words min-w-0">{msg.message}</span>
              </div>
            )
          )}
        </div>

        {renderPinnedQuiz()}

        <div className="flex items-center gap-2 p-2 border-t border-wc-border flex-shrink-0" style={{ direction: "rtl" }}>
          <input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onFocus={() => { if (!chatUsername) { setShowNamePrompt(true); setTimeout(() => nameInputRef.current?.focus(), 50); } }}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={chatUsername ? "اكتب رسالة..." : "اختر اسمك أولاً..."}
            className="flex-1 text-xs text-wc-text px-3 py-2 rounded-full border-0 outline-none bg-wc-elevated placeholder:text-wc-muted"
          />
          <button onClick={sendMessage} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-wc-accent">
            <Send size={14} className="text-wc-accent-foreground" />
          </button>
        </div>

        {showNamePrompt && (
          <div className="absolute inset-0 z-30 rounded-2xl bg-wc-bg flex flex-col items-center justify-center p-6 gap-4">
            <div className="text-center">
              <p className="text-2xl mb-2">🎙️</p>
              <h3 className="text-wc-text font-bold text-base mb-1">ما اسمك في الدردشة؟</h3>
              <p className="text-[11px] text-wc-muted">سيظهر اسمك لبقية المشجعين</p>
            </div>
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmName()}
              placeholder="مثال: مدريدي عتيق، كوليه..."
              maxLength={20}
              className="w-full text-sm text-wc-text px-4 py-3 rounded-full border border-wc-border outline-none text-center bg-wc-elevated placeholder:text-wc-muted"
              style={{ direction: "rtl" }}
            />
            <button onClick={confirmName} disabled={!nameInput.trim()} className="w-full py-3 rounded-full font-bold text-wc-accent-foreground text-sm bg-wc-accent disabled:opacity-40">
              انضم للدردشة
            </button>
            <button onClick={() => setShowNamePrompt(false)} className="text-[11px] text-wc-muted underline">إلغاء</button>
          </div>
        )}
      </div>

      <UserStatsCard refreshKey={userPoints} />
      <MiniLeaderboard refreshKey={userPoints} />

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default LaLigaInGame;
