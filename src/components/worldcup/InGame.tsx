import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Send, UserPlus, Trophy, X } from "lucide-react";
import MiniLeaderboard from "./MiniLeaderboard";
import {
  mockLiveChatMessages,
  mockReactions as initialReactions,
  worldcupQuizzes,
  mockFriendsList,
  type Quiz,
} from "@/lib/worldcupMockData";
import {
  getTotalPoints,
  getUserRank,
  getLeaderboard,
  getQuizAccuracy,
  addPoints,
  recordQuizAnswer,
  setUsername as storeSetUsername,
  getPlayerData,
  syncPointsToDb,
} from "@/lib/pointsStore";
import { supabase } from "@/integrations/supabase/client";

const MATCH_ID = "wc-iraq-germany-2026";

interface InGameProps {
  userId?: string | null;
  username?: string | null;
}

type EventType = "goal" | "yellow_card" | "halftime" | "var";

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  isSystem?: boolean;
  isUser?: boolean;
}

const EVENT_CONFIG: Record<
  EventType,
  {
    emoji: string;
    label: string;
    bannerText: string;
    bannerClass: string;
    chatMessage: string;
    floods: Array<{ username: string; message: string }>;
  }
> = {
  goal: {
    emoji: "⚽",
    label: "هدف",
    bannerText: "⚽  هدف العراق!!  أيمن حسين 🇮🇶",
    bannerClass: "bg-green-700",
    chatMessage: "⚽ هدف — أيمن حسين — العراق 🇮🇶",
    floods: [
      { username: "أبو حسين", message: "هدددددف!! 🇮🇶🔥🔥" },
      { username: "نمر الرافدين", message: "الله أكبر!! 💪💪" },
      { username: "ابن بغداد", message: "أيمن حسين أسطورة!! ❤️" },
      { username: "عاشق الكرة", message: "يلا يلا يلا 🎉🎉🎉" },
    ],
  },
  yellow_card: {
    emoji: "🟨",
    label: "بطاقة",
    bannerText: "🟨  بطاقة صفراء — موسيالا",
    bannerClass: "bg-yellow-600",
    chatMessage: "🟨 بطاقة صفراء — موسيالا — ألمانيا",
    floods: [
      { username: "مشجع أسود", message: "استحقها 🟨😤" },
      { username: "صقر العراق", message: "الحكم شايف كل شي 👀" },
      { username: "أبو حسين", message: "الضغط يبدأ الآن 💪" },
    ],
  },
  halftime: {
    emoji: "⏸️",
    label: "استراحة",
    bannerText: "⏸️  الاستراحة — نهاية الشوط الأول",
    bannerClass: "bg-blue-700",
    chatMessage: "⏸️ الاستراحة — انتهى الشوط الأول",
    floods: [
      { username: "نمر الرافدين", message: "شوط أول ممتاز! 👏" },
      { username: "ابن بغداد", message: "المدرب لازم يعدل التشكيلة 🤔" },
      { username: "عاشق الكرة", message: "إن شاء الله الشوط الثاني أفضل ⚽" },
    ],
  },
  var: {
    emoji: "🖥️",
    label: "VAR",
    bannerText: "🖥️  مراجعة VAR جارية...",
    bannerClass: "bg-purple-700",
    chatMessage: "🖥️ توقف اللعب — مراجعة VAR",
    floods: [
      { username: "أسد الرافدين", message: "وش يشوف بالـ VAR؟ 🖥️" },
      { username: "مشجع أسود", message: "يا ربي يثبّته هدف 🙏" },
      { username: "صقر العراق", message: "إذا ألغوه أرد الحكم 😂" },
    ],
  },
};

const AUTO_MESSAGES: Array<{ username: string; message: string }> = [
  { username: "فارس بغداد", message: "يلا يلا العراق 🇮🇶" },
  { username: "ملك المدرجات", message: "المباراة حماسية جداً 🔥" },
  { username: "صقر العراق", message: "أداء رائع من المنتخب 💪" },
  { username: "نجم الملاعب", message: "نريد المزيد من الأهداف ⚽" },
  { username: "أبو كرم", message: "الله وياكم يا أسود 🦁" },
  { username: "قمر بغداد", message: "العراق للنهائي إن شاء الله 🏆" },
];

// Username color palette for YouTube-like colored names
const USERNAME_COLORS = [
  "text-sky-400",
  "text-pink-400",
  "text-amber-400",
  "text-emerald-400",
  "text-violet-400",
  "text-orange-400",
  "text-cyan-400",
  "text-rose-400",
];

function getUsernameColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

const InGame = ({ userId = null, username = null }: InGameProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>(
    mockLiveChatMessages.map((m) => ({ ...m }))
  );
  const [newMsg, setNewMsg] = useState("");
  const [reactions, setReactions] = useState(
    initialReactions.map((r) => ({
      ...r,
      count: Math.floor(Math.random() * 200) + 50,
    }))
  );
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [activeEvent, setActiveEvent] = useState<EventType | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [quizTimer, setQuizTimer] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [showFriendSheet, setShowFriendSheet] = useState(false);
  const [userPoints, setUserPoints] = useState(() => getTotalPoints());
  const [userRank, setUserRank] = useState(() => getUserRank());
  const [leaderboard, setLeaderboard] = useState(() => getLeaderboard());
  const [usedQuizIds, setUsedQuizIds] = useState<Set<string>>(new Set());
  const [chatUsername, setChatUsername] = useState<string | null>(
    () => username ?? getPlayerData().username
  );
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Hype meter state
  const [hypeCount, setHypeCount] = useState(6842);
  const [hasTapped, setHasTapped] = useState(false);
  const [hypeExpanded, setHypeExpanded] = useState(true);

  // Pinned quiz state
  const pinnedQuizzes = worldcupQuizzes.filter((q) => q.phase === "live");
  const [pinnedQuizIndex, setPinnedQuizIndex] = useState(0);
  const [pinnedQuizSelected, setPinnedQuizSelected] = useState<number | null>(null);
  const [pinnedQuizAnswered, setPinnedQuizAnswered] = useState(false);
  const [quizExpanded, setQuizExpanded] = useState(true);
  const [hasNewQuiz, setHasNewQuiz] = useState(true);

  const currentPinnedQuiz = pinnedQuizzes[pinnedQuizIndex % pinnedQuizzes.length];

  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat on new messages
  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Simulate live chat traffic
  useEffect(() => {
    const interval = setInterval(() => {
      const msg = AUTO_MESSAGES[Math.floor(Math.random() * AUTO_MESSAGES.length)];
      setMessages((prev) => [
        ...prev,
        { id: `auto-${Date.now()}`, ...msg, timestamp: "الآن" },
      ]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Hype auto-increment
  useEffect(() => {
    const interval = setInterval(() => {
      setHypeCount((prev) => prev + Math.floor(Math.random() * 8) + 2);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Quiz countdown
  useEffect(() => {
    if (!activeQuiz || quizAnswered || quizTimer <= 0) return;
    const t = setTimeout(() => {
      if (quizTimer === 1) {
        setQuizAnswered(true);
      } else {
        setQuizTimer((prev) => prev - 1);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [quizTimer, quizAnswered, activeQuiz]);

  // Auto-dismiss quiz after answering
  useEffect(() => {
    if (!quizAnswered || !activeQuiz) return;
    const t = setTimeout(() => {
      setActiveQuiz(null);
      setQuizAnswered(false);
      setQuizSelected(null);
    }, 2500);
    return () => clearTimeout(t);
  }, [quizAnswered, activeQuiz]);

  // Auto-dismiss event banner
  useEffect(() => {
    if (!activeEvent) return;
    const t = setTimeout(() => setActiveEvent(null), 3000);
    return () => clearTimeout(t);
  }, [activeEvent]);

  // Supabase Realtime: subscribe to live chat_messages for this match
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${MATCH_ID}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `match_id=eq.${MATCH_ID}`,
        },
        (payload) => {
          const row = payload.new as { id: string; user_id: string | null; message: string; created_at: string };
          // Ignore our own optimistic messages (already appended locally)
          if (row.user_id === userId) return;
          setMessages((prev) => [
            ...prev,
            {
              id: row.id,
              username: "مشجع",
              message: row.message,
              timestamp: "الآن",
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const triggerEvent = (type: EventType) => {
    const cfg = EVENT_CONFIG[type];

    setActiveEvent(type);

    // System message inline in chat
    setMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        username: "النظام",
        message: cfg.chatMessage,
        timestamp: "الآن",
        isSystem: true,
      },
    ]);

    // Flood chat
    cfg.floods.forEach((msg, i) => {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: `flood-${Date.now()}-${i}`,
            username: msg.username,
            message: msg.message,
            timestamp: "الآن",
          },
        ]);
      }, (i + 1) * 350);
    });

    // Bump reactions for goals
    if (type === "goal") {
      setReactions((prev) =>
        prev.map((r) => ({
          ...r,
          count: r.count + Math.floor(Math.random() * 60) + 20,
        }))
      );
    }

    // Trigger a quiz after 1.5 s
    const available = worldcupQuizzes.filter(
      (q) => q.phase === "live" && q.triggerEvent === type && !usedQuizIds.has(q.id)
    );
    if (available.length > 0) {
      const quiz = available[Math.floor(Math.random() * available.length)];
      setTimeout(() => {
        setActiveQuiz(quiz);
        setQuizTimer(15);
        setQuizAnswered(false);
        setQuizSelected(null);
        setUsedQuizIds((prev) => new Set([...prev, quiz.id]));
      }, 1500);
    }
  };

  const handleQuizAnswer = (idx: number) => {
    if (quizAnswered) return;
    setQuizSelected(idx);
    setQuizAnswered(true);
    if (activeQuiz) {
      const correct = idx === activeQuiz.correctIndex;
      recordQuizAnswer(correct);
      if (correct) {
        const newTotal = addPoints(activeQuiz.points, "in-game-quiz");
        setUserPoints(newTotal);
        const newRank = getUserRank();
        setUserRank(newRank);
        setLeaderboard(getLeaderboard());
        if (userId) syncPointsToDb(userId).then(() => {});
      }
    }
  };

  const sendMessage = () => {
    if (!chatUsername) {
      setShowNamePrompt(true);
      setTimeout(() => nameInputRef.current?.focus(), 50);
      return;
    }
    const text = newMsg.trim();
    if (!text) return;

    // Optimistic local append
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        username: chatUsername,
        message: text,
        timestamp: "الآن",
        isUser: true,
      },
    ]);
    setNewMsg("");

    // Persist to Supabase if authenticated
    if (userId) {
      (supabase as any)
        .from("chat_messages")
        .insert({ user_id: userId, match_id: MATCH_ID, message: text })
        .then(() => {});
    }
  };

  const confirmName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setChatUsername(trimmed);
    storeSetUsername(trimmed);
    setLeaderboard(getLeaderboard()); // re-render leaderboard with real name
    setShowNamePrompt(false);
    setNameInput("");
  };

  const handleInviteFriend = (friendName: string) => {
    setShowFriendSheet(false);
    setNewMsg(`@${friendName} `);
    setMessages((prev) => [
      ...prev,
      {
        id: `invite-${Date.now()}`,
        username: "النظام",
        message: `📩 تمت دعوة ${friendName} للانضمام إلى الدردشة`,
        timestamp: "الآن",
        isSystem: true,
      },
    ]);
  };

  const handleReaction = (idx: number) => {
    setReactions((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, count: r.count + 1 } : r))
    );
  };

  const hypeFill = Math.min((hypeCount / 15000) * 100, 100);
  const hypeTier =
    hypeCount < 3000
      ? { label: "الجمهور يتحرك...", barClass: "bg-wc-accent" }
      : hypeCount < 8000
      ? { label: "الملعب يشتعل! 🔥", barClass: "bg-wc-warning" }
      : { label: "العراق كله معاك! 💥", barClass: "bg-wc-danger" };

  const handleNextPinnedQuiz = () => {
    setPinnedQuizIndex((i) => i + 1);
    setPinnedQuizSelected(null);
    setPinnedQuizAnswered(false);
    setQuizExpanded(true);
    setHasNewQuiz(true);
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

  const renderPinnedQuiz = () => {
    if (!currentPinnedQuiz) return null;
    return (
      <div className="px-3 py-2 border-t border-wc-border flex-shrink-0">
        {quizExpanded ? (
          <div className="rounded-xl p-3 border border-wc-warning/30 bg-wc-warning/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-wc-text">🧠 اختبار المعرفة</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-wc-elevated text-wc-muted border border-wc-border">
                  +{currentPinnedQuiz.points} نقطة
                </span>
                <button onClick={() => { setQuizExpanded(false); setHasNewQuiz(false); }} className="p-0.5 rounded-full hover:bg-wc-elevated">
                  <ChevronDown size={12} className="text-wc-muted" />
                </button>
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
                        setUserRank(getUserRank());
                        setLeaderboard(getLeaderboard());
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
              pinnedQuizAnswered
                ? "bg-wc-elevated border border-wc-border"
                : "bg-wc-warning/10 border border-wc-warning/30 hover:bg-wc-warning/15"
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
      <div className="rounded-2xl p-3 bg-wc-surface border border-wc-border">
        <p className="text-[10px] text-wc-muted mb-2 text-center">
          محاكاة حدث في المباراة
        </p>
        <div className="flex gap-2">
          {(Object.entries(EVENT_CONFIG) as [EventType, (typeof EVENT_CONFIG)[EventType]][]).map(
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

      {/* ── Friends + Rank Row ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5" style={{ direction: "ltr" }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] bg-wc-elevated border-2 border-wc-bg"
              >
                👤
              </div>
            ))}
          </div>
          <span className="text-[11px] text-wc-muted">3 أصدقاء يشاهدون</span>
        </div>
        <button
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-wc-elevated border border-wc-border"
        >
          <Trophy size={12} className="text-wc-warning" />
          <span className="text-xs font-bold text-wc-text">#{userRank}</span>
        </button>
      </div>

      {/* ── Leaderboard (expandable) ─────────────────────────────────────── */}
      {showLeaderboard && (
        <div className="rounded-2xl overflow-hidden bg-wc-surface border border-wc-border">
          <div className="px-4 py-2.5 border-b border-wc-border flex items-center justify-between">
            <span className="text-wc-text text-sm font-bold">التصنيف المباشر</span>
            <button onClick={() => setShowLeaderboard(false)}>
              <X size={14} className="text-wc-muted" />
            </button>
          </div>
          <div className="px-3 py-2 space-y-1">
            {leaderboard.slice(0, 7).map((user) => (
              <div
                key={user.rank}
                className={`flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs ${
                  user.isCurrentUser ? "bg-wc-accent/15" : ""
                }`}
              >
                <span
                  className={`font-bold w-4 text-center ${
                    user.rank <= 3 ? "text-wc-warning" : "text-wc-muted"
                  }`}
                >
                  {user.rank}
                </span>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] bg-wc-elevated text-wc-text font-bold">
                  {user.username[0]}
                </div>
                <span
                  className={`flex-1 text-wc-text ${user.isCurrentUser ? "font-bold" : ""}`}
                >
                  {user.username}{" "}
                  {user.isCurrentUser && (
                    <span className="text-wc-accent text-[9px]">(أنت)</span>
                  )}
                </span>
                <span className="font-mono text-wc-accent">{user.points}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reaction Bar ─────────────────────────────────────────────────── */}
      <div
        className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5"
        style={{ direction: "ltr" }}
      >
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

      {/* ── Live Chat (YouTube-style) ────────────────────────────────────── */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden bg-wc-surface border border-wc-border relative"
        style={{ height: "480px" }}
      >
        {/* Event Banner — slides in from top */}
        {activeEvent && (
          <div
            className={`absolute top-11 left-2 right-2 z-10 rounded-xl px-4 py-2.5 text-center text-sm font-bold text-white ${EVENT_CONFIG[activeEvent].bannerClass}`}
            style={{
              animation: "slideDown 0.25s ease",
            }}
          >
            {EVENT_CONFIG[activeEvent].bannerText}
          </div>
        )}

        {/* Quiz Overlay — floats above the bottom of the chat */}
        {activeQuiz && (
          <div className="absolute bottom-14 left-2 right-2 z-20 rounded-2xl p-4 border border-wc-accent shadow-xl bg-wc-elevated">
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-wc-text text-sm font-bold leading-snug flex-1">
                {activeQuiz.question}
              </span>
              {!quizAnswered ? (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-bold text-wc-accent-foreground flex-shrink-0 ${
                    quizTimer <= 5 ? "bg-wc-danger animate-pulse" : "bg-wc-danger"
                  }`}
                >
                  {quizTimer} ث
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-wc-elevated text-wc-muted flex-shrink-0 border border-wc-border">
                  +{activeQuiz.points} نقطة
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {activeQuiz.options.map((opt, i) => {
                let cls = "bg-wc-surface text-wc-muted border border-wc-border";
                if (quizAnswered) {
                  if (i === activeQuiz.correctIndex)
                    cls = "bg-wc-accent text-wc-accent-foreground border-transparent";
                  else if (i === quizSelected)
                    cls = "bg-wc-danger text-wc-accent-foreground border-transparent";
                } else if (i === quizSelected) {
                  cls = "bg-wc-accent text-wc-accent-foreground border-transparent";
                }
                return (
                  <button
                    key={i}
                    onClick={() => handleQuizAnswer(i)}
                    disabled={quizAnswered}
                    className={`py-2 rounded-full text-xs font-medium transition-all ${cls}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {quizAnswered && (
              <p
                className={`text-center text-xs mt-2 font-bold ${
                  quizSelected === activeQuiz.correctIndex
                    ? "text-wc-accent"
                    : "text-wc-danger"
                }`}
              >
                {quizSelected === activeQuiz.correctIndex
                  ? `🎉 صح! +${activeQuiz.points} نقطة`
                  : `❌ الإجابة: ${activeQuiz.options[activeQuiz.correctIndex]}`}
              </p>
            )}
          </div>
        )}

        {/* Chat Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-wc-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-wc-text text-sm font-bold">الدردشة</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-wc-danger text-wc-accent-foreground">
              🔴 مباشر
            </span>
          </div>
          <button
            onClick={() => {
              const msg = encodeURIComponent("العراق ضد ألمانيا 🇮🇶⚽🇩🇪 — المباراة مباشرة الآن! انضم للدردشة\nhttps://team-centric-fandom.lovable.app/world-cup");
              window.open(`https://wa.me/?text=${msg}`, "_blank");
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-wc-accent border border-wc-accent bg-wc-accent/10"
          >
            <UserPlus size={12} />
            <span>دعوة</span>
          </button>
        </div>

        {/* Pinned Hype Meter */}
        {renderPinnedHype()}

        {/* Messages */}
        <div
          ref={chatRef}
          className="flex-1 min-h-0 overflow-y-auto py-2 px-3 space-y-1"
          style={{ direction: "rtl" }}
        >
          {messages.map((msg) =>
            msg.isSystem ? (
              <div key={msg.id} className="flex justify-center py-0.5">
                <span className="text-[10px] px-3 py-1 rounded-full bg-wc-elevated text-wc-muted">
                  {msg.message}
                </span>
              </div>
            ) : (
              <div key={msg.id} className="flex items-baseline gap-1.5">
                <span
                  className={`text-[10px] font-bold flex-shrink-0 ${
                    msg.isUser ? "text-wc-accent" : getUsernameColor(msg.username)
                  }`}
                >
                  {msg.username}
                </span>
                <span className="text-wc-text text-[11px] leading-snug break-words min-w-0">
                  {msg.message}
                </span>
              </div>
            )
          )}
        </div>

        {/* Pinned Quiz */}
        {renderPinnedQuiz()}

        {/* Input Bar */}
        <div
          className="flex items-center gap-2 p-2 border-t border-wc-border flex-shrink-0"
          style={{ direction: "rtl" }}
        >
          <input
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            onFocus={() => {
              if (!chatUsername) {
                setShowNamePrompt(true);
                setTimeout(() => nameInputRef.current?.focus(), 50);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={chatUsername ? "اكتب رسالة..." : "اختر اسمك أولاً..."}
            className="flex-1 text-xs text-wc-text px-3 py-2 rounded-full border-0 outline-none bg-wc-elevated placeholder:text-wc-muted"
          />
          <button
            onClick={sendMessage}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-wc-accent"
          >
            <Send size={14} className="text-wc-accent-foreground" />
          </button>
        </div>

        {/* Name Prompt Overlay */}
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
              placeholder="مثال: أبو علي، نمر الرافدين..."
              maxLength={20}
              className="w-full text-sm text-wc-text px-4 py-3 rounded-full border border-wc-border outline-none text-center bg-wc-elevated placeholder:text-wc-muted"
              style={{ direction: "rtl" }}
            />
            <button
              onClick={confirmName}
              disabled={!nameInput.trim()}
              className="w-full py-3 rounded-full font-bold text-wc-accent-foreground text-sm bg-wc-accent disabled:opacity-40"
            >
              انضم للدردشة
            </button>
            <button
              onClick={() => setShowNamePrompt(false)}
              className="text-[11px] text-wc-muted underline"
            >
              إلغاء
            </button>
          </div>
        )}

        {/* Friend Invite Sheet */}
        {showFriendSheet && (
          <div className="absolute inset-0 z-30 rounded-2xl bg-wc-bg/97 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-wc-border">
              <span className="text-wc-text font-bold text-sm">دعوة صديق للدردشة</span>
              <button onClick={() => setShowFriendSheet(false)}>
                <X size={16} className="text-wc-muted" />
              </button>
            </div>
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              {mockFriendsList.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => handleInviteFriend(friend.username)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all bg-wc-elevated active:scale-[0.98]"
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-wc-surface text-wc-text border border-wc-border">
                    {friend.username[0]}
                  </div>
                  <span className="flex-1 text-wc-text text-sm text-right">
                    {friend.username}
                  </span>
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      friend.online ? "bg-wc-accent" : "bg-wc-muted"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── User Stats ──────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-3">📊 إحصائياتك</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "مجموع النقاط", value: userPoints.toLocaleString("ar-EG"), icon: "🏆" },
            { label: "دقة الأجوبة", value: getQuizAccuracy() > 0 ? `${getQuizAccuracy()}%` : "—", icon: "🎯" },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl p-3 text-center bg-wc-elevated border border-wc-border">
              <span className="text-lg">{stat.icon}</span>
              <p className="text-wc-text font-bold text-lg mt-1">{stat.value}</p>
              <p className="text-xs text-wc-muted mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mini Leaderboard ────────────────────────────────────────── */}
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

export default InGame;
