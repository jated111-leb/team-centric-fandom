import { useState, useEffect, useRef } from "react";
import { Send, UserPlus, ChevronDown, ChevronUp } from "lucide-react";
import {
  laligaQuizzes,
  LALIGA_PRE_CHAT_MESSAGES,
  LALIGA_LIVE_CHAT_MESSAGES,
} from "@/lib/laligaMockData";
import {
  addPoints,
  recordQuizAnswer,
  savePrediction,
  getPrediction,
  setUsername as storeSetUsername,
  getPlayerData,
} from "@/lib/pointsStore";
import MiniLeaderboard from "@/components/worldcup/MiniLeaderboard";
import UserStatsCard from "@/components/worldcup/UserStatsCard";
import fedshiLogo from "@/assets/fedshi-logo.png";
import type { MatchData } from "@/pages/LaLiga";

interface LaLigaPreGameProps {
  match: MatchData;
  userId: string | null;
  username: string | null;
}

const preQuizzes = laligaQuizzes.filter((q) => q.phase === "pre");

const USERNAME_COLORS = [
  "text-sky-400", "text-pink-400", "text-amber-400", "text-emerald-400",
  "text-violet-400", "text-orange-400", "text-cyan-400", "text-rose-400",
];
function getUsernameColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  isSystem?: boolean;
  isUser?: boolean;
}

const LaLigaPreGame = ({ match, userId, username }: LaLigaPreGameProps) => {
  const [prediction, setPrediction] = useState<string | null>(() => getPrediction());
  const [votes, setVotes] = useState({ A: 42, draw: 18, B: 40 });
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [preQuizSelected, setPreQuizSelected] = useState<number | null>(null);
  const [preQuizAnswered, setPreQuizAnswered] = useState(false);
  const currentQuiz = preQuizzes[quizIndex % preQuizzes.length];

  const [hypeExpanded, setHypeExpanded] = useState(true);
  const [quizExpanded, setQuizExpanded] = useState(true);
  const [hasNewQuiz, setHasNewQuiz] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    LALIGA_LIVE_CHAT_MESSAGES.slice(0, 4).map((m) => ({ ...m }))
  );
  const [newMsg, setNewMsg] = useState("");
  const [chatUsername, setChatUsername] = useState<string | null>(
    () => username ?? getPlayerData().username
  );
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [hypeCount, setHypeCount] = useState(3127);
  const [hasTapped, setHasTapped] = useState(false);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      const rand = Math.random();
      setVotes((prev) => {
        if (rand < 0.5) return { ...prev, A: prev.A + 1 };
        if (rand < 0.72) return { ...prev, draw: prev.draw + 1 };
        return { ...prev, B: prev.B + 1 };
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const msg = LALIGA_PRE_CHAT_MESSAGES[Math.floor(Math.random() * LALIGA_PRE_CHAT_MESSAGES.length)];
      setMessages((prev) => [...prev, { id: `auto-${Date.now()}`, ...msg, timestamp: "الآن" }]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setHypeCount((prev) => prev + Math.floor(Math.random() * 5) + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const total = votes.A + votes.draw + votes.B;
  const getVotePercent = (key: "A" | "draw" | "B") => Math.round((votes[key] / total) * 100);

  const hypeFill = Math.min((hypeCount / 10000) * 100, 100);
  const hypeTier =
    hypeCount < 2000
      ? { label: "الجمهور يتحرك...", barClass: "bg-wc-accent" }
      : hypeCount < 5000
      ? { label: "الملعب يشتعل! 🔥", barClass: "bg-wc-warning" }
      : { label: "الليغا كلها معاك! 💥", barClass: "bg-wc-danger" };

  const handleNextQuiz = () => {
    setQuizIndex((i) => i + 1);
    setPreQuizSelected(null);
    setPreQuizAnswered(false);
    setQuizExpanded(true);
    setHasNewQuiz(true);
  };

  const sendMessage = () => {
    if (!chatUsername) {
      setShowNamePrompt(true);
      setTimeout(() => nameInputRef.current?.focus(), 50);
      return;
    }
    const text = newMsg.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), username: chatUsername, message: text, timestamp: "الآن", isUser: true },
    ]);
    setNewMsg("");
  };

  const confirmName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setChatUsername(trimmed);
    storeSetUsername(trimmed);
    setLeaderboardKey((k) => k + 1);
    setShowNamePrompt(false);
    setNameInput("");
  };

  const renderPinnedHype = () => (
    <div className="px-3 py-2 border-b border-wc-border flex-shrink-0">
      {hypeExpanded ? (
        <div className="rounded-xl p-3 border border-wc-accent/30 bg-wc-accent/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-wc-text">🔥 حرارة الجمهور</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-wc-secondary">{hypeCount.toLocaleString("ar-EG")} مشجع</span>
              <button onClick={() => setHypeExpanded(false)} className="p-0.5 rounded-full hover:bg-wc-elevated">
                <ChevronUp size={12} className="text-wc-muted" />
              </button>
            </div>
          </div>
          <div className="h-2.5 rounded-full mb-2 overflow-hidden bg-wc-elevated">
            <div className={`h-full rounded-full transition-all duration-700 ${hypeTier.barClass}`} style={{ width: `${hypeFill}%` }} />
          </div>
          {!hasTapped ? (
            <button
              onClick={() => { setHasTapped(true); setHypeCount((prev) => prev + 1); }}
              className="w-full py-2 rounded-full font-bold text-wc-accent-foreground text-xs bg-wc-accent active:scale-95 transition-transform"
            >
              أشعل الحماس 🔥
            </button>
          ) : (
            <div className="w-full py-2 rounded-full text-center text-[10px] font-bold bg-wc-elevated text-wc-accent border border-wc-accent">
              أنت من بين {hypeCount.toLocaleString("ar-EG")} مشجع ✅
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setHypeExpanded(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wc-accent/10 border border-wc-accent/30 hover:bg-wc-accent/15 transition-all"
        >
          <span className="text-xs">🔥</span>
          <span className="text-xs font-bold text-wc-accent">{hypeCount.toLocaleString("ar-EG")} مشجع</span>
          <ChevronDown size={10} className="text-wc-muted" />
        </button>
      )}
    </div>
  );

  const renderPinnedQuiz = () => (
    <div className="px-3 py-2 border-t border-wc-border flex-shrink-0">
      {quizExpanded ? (
        <div className="rounded-xl p-3 border border-wc-warning/30 bg-wc-warning/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-wc-text">🧠 اختبار المعرفة</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-wc-elevated text-wc-muted border border-wc-border">
                +{currentQuiz.points} نقطة
              </span>
              <button onClick={() => { setQuizExpanded(false); setHasNewQuiz(false); }} className="p-0.5 rounded-full hover:bg-wc-elevated">
                <ChevronDown size={12} className="text-wc-muted" />
              </button>
            </div>
          </div>
          <p className="text-wc-text text-[11px] mb-2 leading-relaxed">{currentQuiz.question}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {currentQuiz.options.map((opt, i) => {
              let cls = "bg-wc-elevated text-wc-muted";
              if (preQuizAnswered) {
                if (i === currentQuiz.correctIndex) cls = "bg-wc-accent text-wc-accent-foreground";
                else if (i === preQuizSelected) cls = "bg-wc-danger text-wc-accent-foreground";
              }
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (preQuizAnswered) return;
                    setPreQuizSelected(i);
                    setPreQuizAnswered(true);
                    const correct = i === currentQuiz.correctIndex;
                    recordQuizAnswer(correct);
                    if (correct) addPoints(currentQuiz.points, "pre-trivia");
                    setLeaderboardKey((k) => k + 1);
                  }}
                  disabled={preQuizAnswered}
                  className={`py-2 rounded-full text-[10px] font-medium transition-all ${cls}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {preQuizAnswered && (
            <div className="mt-1.5 flex items-center justify-between">
              <p className={`text-[10px] font-bold ${preQuizSelected === currentQuiz.correctIndex ? "text-wc-accent" : "text-wc-danger"}`}>
                {preQuizSelected === currentQuiz.correctIndex
                  ? `🎉 صح! +${currentQuiz.points} نقطة`
                  : `❌ الصحيح: ${currentQuiz.options[currentQuiz.correctIndex]}`}
              </p>
              <button onClick={handleNextQuiz} className="text-[9px] text-wc-accent underline">التالي ›</button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setQuizExpanded(true)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
            preQuizAnswered
              ? "bg-wc-elevated border border-wc-border"
              : "bg-wc-warning/10 border border-wc-warning/30 hover:bg-wc-warning/15"
          } transition-all`}
        >
          <span className="text-xs">🧠</span>
          <span className={`text-[10px] font-bold ${preQuizAnswered ? "text-wc-muted" : "text-wc-warning"}`}>
            {preQuizAnswered ? "تم الإجابة ✅" : "سؤال جديد!"}
          </span>
          <ChevronUp size={10} className="text-wc-muted" />
          {!preQuizAnswered && hasNewQuiz && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-wc-danger animate-pulse" />
          )}
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* فدشي Subscription Card */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center gap-2 mb-3">
          <img src={fedshiLogo} alt="فدشي" className="h-6 w-auto rounded" />
          <span className="text-wc-text text-sm font-bold">شاهد الدوري الإسباني مباشرة على فدشي</span>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-wc-muted">⚽ جميع مباريات لا ليغا مباشرة</p>
          <p className="text-xs text-wc-muted">📺 شاهد الآن داخل التطبيق</p>
          <button className="w-full mt-2 py-2.5 rounded-full font-bold text-wc-accent-foreground text-sm bg-wc-accent">
            شاهد الآن
          </button>
        </div>
      </div>

      {/* Prediction */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-wc-text font-bold text-sm">من تتوقع الفوز؟</h3>
          {prediction && <span className="text-[10px] text-wc-muted">{total.toLocaleString()} صوت</span>}
        </div>
        <div className="flex gap-2">
          {([
            { key: "A" as const, label: match.home_team_arabic },
            { key: "draw" as const, label: "تعادل" },
            { key: "B" as const, label: match.away_team_arabic },
          ]).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setVotes((prev) => {
                  const updated = { ...prev, [opt.key]: prev[opt.key] + 1 };
                  if (prediction && prediction !== opt.key) {
                    updated[prediction as "A" | "draw" | "B"] = Math.max(0, updated[prediction as "A" | "draw" | "B"] - 1);
                  }
                  return updated;
                });
                setPrediction(opt.key);
                savePrediction(opt.key);
              }}
              className={`flex-1 py-2.5 rounded-full text-xs font-bold transition-all ${
                prediction === opt.key ? "bg-wc-info text-white" : "bg-wc-elevated text-wc-muted"
              }`}
            >
              <div>{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-80">
                {getVotePercent(opt.key)}% · {votes[opt.key].toLocaleString("ar-EG")}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col rounded-2xl overflow-hidden bg-wc-surface border border-wc-border relative" style={{ height: "480px" }}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-wc-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-wc-text text-sm font-bold">الدردشة</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-wc-accent/20 text-wc-accent">
              قبل المباراة
            </span>
          </div>
          <button
            onClick={() => {
              const msg = encodeURIComponent(`${match.home_team_arabic} ضد ${match.away_team_arabic} ⚽ — انضم للدردشة!\nhttps://team-centric-fandom.lovable.app/la-liga`);
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
          {messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="flex justify-center py-0.5">
                  <span className="text-[10px] px-3 py-1 rounded-full bg-wc-elevated text-wc-muted">{msg.message}</span>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex items-baseline gap-1.5">
                <span className={`text-[10px] font-bold flex-shrink-0 ${msg.isUser ? "text-wc-accent" : getUsernameColor(msg.username)}`}>
                  {msg.username}
                </span>
                <span className="text-wc-text text-[11px] leading-snug break-words min-w-0">{msg.message}</span>
              </div>
            );
          })}
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

      <UserStatsCard refreshKey={leaderboardKey} />
      <MiniLeaderboard refreshKey={leaderboardKey} />
    </div>
  );
};

export default LaLigaPreGame;
