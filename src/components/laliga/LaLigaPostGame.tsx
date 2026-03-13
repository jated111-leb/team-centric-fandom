import { useState, useEffect } from "react";
import { Star, Bell, Share2, MessageCircle } from "lucide-react";
import {
  getTotalPoints,
  getUserRank,
  getPrediction,
  awardPredictionPoints,
} from "@/lib/pointsStore";
import MiniLeaderboard from "@/components/worldcup/MiniLeaderboard";
import UserStatsCard from "@/components/worldcup/UserStatsCard";
import type { MatchData } from "@/pages/LaLiga";

interface LaLigaPostGameProps {
  match: MatchData;
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase();
}

const LaLigaPostGame = ({ match }: LaLigaPostGameProps) => {
  const [rating, setRating] = useState(0);
  const [reminded, setReminded] = useState(false);
  const [leaderboardKey, setLeaderboardKey] = useState(0);

  useEffect(() => {
    const result = awardPredictionPoints();
    if (result.awarded) setLeaderboardKey((k) => k + 1);
  }, []);

  const scoreHome = match.score_home ?? 0;
  const scoreAway = match.score_away ?? 0;
  const winner =
    scoreHome > scoreAway
      ? match.home_team_arabic
      : scoreAway > scoreHome
      ? match.away_team_arabic
      : null;

  const chatStats = {
    totalMessages: 847,
    totalParticipants: 112,
    peakConcurrent: 43,
  };

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* Match Result */}
      <div className="rounded-2xl p-5 text-center border border-wc-border" style={{ background: "var(--wc-gradient-card)" }}>
        <p className="text-xs mb-2 text-wc-accent font-bold">🏆 نتيجة المباراة</p>
        <div className="flex items-center justify-center gap-6 mb-3">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-1">
              <span className="text-white font-bold text-sm">{getInitials(match.home_team)}</span>
            </div>
            <p className="text-wc-text text-xs font-bold">{match.home_team_arabic}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-wc-text font-bold text-3xl">{scoreHome}</span>
            <span className="text-wc-muted text-sm">-</span>
            <span className="text-wc-text font-bold text-3xl">{scoreAway}</span>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-1">
              <span className="text-white font-bold text-sm">{getInitials(match.away_team)}</span>
            </div>
            <p className="text-wc-text text-xs font-bold">{match.away_team_arabic}</p>
          </div>
        </div>
        {winner ? (
          <span className="text-sm font-bold text-wc-accent">🎉 فوز {winner}!</span>
        ) : (
          <span className="text-sm font-bold text-wc-warning">🤝 تعادل</span>
        )}
      </div>

      {/* Chat Summary */}
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
        </div>
      </div>

      <UserStatsCard refreshKey={leaderboardKey} />
      <MiniLeaderboard refreshKey={leaderboardKey} />

      {/* Invite */}
      <div className="rounded-2xl p-4 flex items-center gap-3 bg-wc-surface border border-wc-border">
        <Share2 size={20} className="text-wc-accent" />
        <div className="flex-1">
          <p className="text-wc-text text-sm font-bold">ادعُ صديقاً للمباراة القادمة</p>
          <p className="text-[10px] text-wc-muted">لا تشاهد المباراة القادمة وحدك!</p>
        </div>
        <button className="px-3 py-1.5 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">شارك</button>
      </div>

      {/* Rate */}
      <div className="rounded-2xl p-4 text-center bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-2">قيّم التجربة</h3>
        <div className="flex justify-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setRating(s)}>
              <Star size={24} className={s <= rating ? "text-wc-warning" : "text-wc-elevated"} fill={s <= rating ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
        {rating > 0 && <p className="text-xs text-wc-accent">شكراً! رأيك يساعدنا ⭐</p>}
      </div>
    </div>
  );
};

export default LaLigaPostGame;
