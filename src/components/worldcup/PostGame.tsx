import { useState, useEffect } from "react";
import { Star, Bell, Share2, MessageCircle } from "lucide-react";
import { mockRelatedContent } from "@/lib/worldcupMockData";
import {
  getTotalPoints,
  getUserRank,
  getQuizAccuracy,
  getPrediction,
  awardPredictionPoints,
} from "@/lib/pointsStore";
import MiniLeaderboard from "./MiniLeaderboard";

const PostGame = () => {
  const [rating, setRating] = useState(0);
  const [reminded, setReminded] = useState(false);
  const [totalPoints, setTotalPoints] = useState(getTotalPoints);
  const [userRank, setUserRank] = useState(getUserRank);
  const [accuracy] = useState(getQuizAccuracy);
  const [predictionCorrect] = useState(() => getPrediction() === "A");
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  // Award prediction points once on mount (Iraq wins = "A")
  useEffect(() => {
    const result = awardPredictionPoints();
    if (result.awarded) {
      setTotalPoints(getTotalPoints());
      setUserRank(getUserRank());
      setLeaderboardKey((k) => k + 1);
    }
  }, []);

  // Mock chat stats
  const chatStats = {
    totalMessages: 1247,
    totalParticipants: 189,
    peakConcurrent: 67,
    mostUsedEmoji: "🇮🇶",
    mostActiveUser: "أسد الرافدين",
    duration: "١٠٤ دقيقة",
  };

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* Match Result */}
      <div className="rounded-2xl p-5 text-center border border-wc-border" style={{ background: "var(--wc-gradient-card)" }}>
        <p className="text-xs mb-2 text-wc-accent font-bold">🏆 نتيجة المباراة</p>
        <div className="flex items-center justify-center gap-6 mb-3">
          <div className="text-center">
            <span className="text-3xl">🇮🇶</span>
            <p className="text-wc-text text-xs font-bold mt-1">العراق</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-wc-text font-bold text-3xl">2</span>
            <span className="text-wc-muted text-sm">-</span>
            <span className="text-wc-text font-bold text-3xl">1</span>
          </div>
          <div className="text-center">
            <span className="text-3xl">🇩🇪</span>
            <p className="text-wc-text text-xs font-bold mt-1">ألمانيا</p>
          </div>
        </div>
        <span className="text-sm font-bold text-wc-accent">🎉 فوز العراق!</span>
      </div>

      {/* Your Match Stats */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-3">📊 إحصائياتك</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "مجموع النقاط", value: totalPoints.toLocaleString("ar-EG"), icon: "🏆" },
            { label: "دقة الأجوبة", value: accuracy > 0 ? `${accuracy}%` : "—", icon: "🎯" },
            {
              label: "توقع النتيجة",
              value: predictionCorrect ? "صحيح ✅" : getPrediction() ? "خطأ ❌" : "—",
              icon: "📊",
            },
          ].map((stat, i) => (
            <div key={i} className={`rounded-xl p-3 text-center bg-wc-elevated border border-wc-border ${i === 2 ? "col-span-2" : ""}`}>
              <span className="text-lg">{stat.icon}</span>
              <p className="text-wc-text font-bold text-lg mt-1">{stat.value}</p>
              <p className="text-xs text-wc-muted mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Mini Leaderboard */}
      <MiniLeaderboard refreshKey={leaderboardKey} />

      {/* ── Chat Summary ("انتهت الدردشة") ──────────────────────────── */}
      <div className="rounded-2xl overflow-hidden bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-wc-border bg-wc-elevated">
          <MessageCircle size={14} className="text-wc-muted" />
          <span className="text-wc-text text-sm font-bold">انتهت الدردشة</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: "رسالة", value: chatStats.totalMessages.toLocaleString("ar-EG"), icon: "💬" },
              { label: "مشارك", value: chatStats.totalParticipants.toLocaleString("ar-EG"), icon: "👥" },
              { label: "ذروة متصل", value: chatStats.peakConcurrent.toLocaleString("ar-EG"), icon: "📈" },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl p-2.5 text-center bg-wc-elevated border border-wc-border">
                <span className="text-base">{stat.icon}</span>
                <p className="text-wc-text font-bold text-sm mt-0.5">{stat.value}</p>
                <p className="text-[9px] text-wc-muted">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-wc-muted">
            <span>أكثر إيموجي: {chatStats.mostUsedEmoji}</span>
            <span>المدة: {chatStats.duration}</span>
          </div>
          <div className="mt-2 text-center">
            <span className="text-[10px] text-wc-muted">🏅 الأكثر نشاطاً: <span className="text-wc-accent font-bold">{chatStats.mostActiveUser}</span></span>
          </div>
        </div>
      </div>

      {/* Related Content */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-wc-text font-bold text-sm">استمر في المشاهدة</h3>
          <span className="text-[10px] text-wc-accent">عرض الكل ›</span>
        </div>
        <div className="space-y-3">
          {mockRelatedContent.map((item) => (
            <div key={item.id} className="flex gap-3 items-center">
              <div
                className="w-24 h-14 rounded-xl flex items-center justify-center flex-shrink-0 relative border border-wc-border"
                style={{ background: "var(--wc-gradient-card)" }}
              >
                <span className="text-2xl">🎬</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-wc-text text-xs font-medium leading-snug line-clamp-2">{item.title}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-wc-muted">{item.type}</span>
                  <span className="text-[10px] text-wc-muted">·</span>
                  <span className="text-[10px] text-wc-muted">{item.duration}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Match Reminder */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-2">المباراة القادمة</h3>
        <div className="flex items-center justify-between">
          <div className="text-right">
            <p className="text-wc-text text-xs">🇮🇶 العراق vs الأردن 🇯🇴</p>
            <p className="text-[10px] mt-0.5 text-wc-muted">الجمعة 20 يونيو · 9:00 م</p>
          </div>
          <button
            onClick={() => setReminded(!reminded)}
            className={`flex items-center gap-1 px-3 py-2 rounded-full text-xs font-bold transition-all ${
              reminded ? "bg-wc-accent text-wc-accent-foreground" : "bg-wc-elevated text-wc-accent"
            }`}
          >
            <Bell size={14} />
            {reminded ? "تم التذكير" : "ذكّرني"}
          </button>
        </div>
      </div>

      {/* Invite */}
      <div className="rounded-2xl p-4 flex items-center gap-3 bg-wc-surface border border-wc-border">
        <Share2 size={20} className="text-wc-accent" />
        <div className="flex-1">
          <p className="text-wc-text text-sm font-bold">ادعُ صديقاً للمباراة القادمة</p>
          <p className="text-[10px] text-wc-muted">شارك التجربة مع أصدقائك</p>
        </div>
        <button className="px-3 py-1.5 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">شارك</button>
      </div>

      {/* Rate Experience */}
      <div className="rounded-2xl p-4 text-center bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-2">قيّم التجربة</h3>
        <div className="flex justify-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setRating(s)}>
              <Star size={24} className={s <= rating ? "text-wc-warning" : "text-wc-elevated"} fill={s <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        {rating > 0 && <p className="text-xs text-wc-accent">شكراً لتقييمك! ⭐</p>}
      </div>
    </div>
  );
};

export default PostGame;
