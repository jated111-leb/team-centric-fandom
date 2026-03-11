import { useState } from "react";
import { Star, Bell, Share2 } from "lucide-react";
import { mockLeaderboard, mockHighlights } from "@/lib/worldcupMockData";

const PostGame = () => {
  const [rating, setRating] = useState(0);
  const [reminded, setReminded] = useState(false);

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* Man of the Match */}
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
        <h3 className="text-wc-text font-bold text-sm mb-3">إحصائياتك</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "النقاط المكتسبة", value: "+85", icon: "🏆" },
            { label: "دقة التوقعات", value: "75%", icon: "🎯" },
            { label: "نتيجة التوقع", value: "صحيح ✅", icon: "📊" },
            { label: "تغيير الترتيب", value: "↑ 3", icon: "📈" },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl p-3 text-center bg-wc-elevated border border-wc-border">
              <span className="text-lg">{stat.icon}</span>
              <p className="text-wc-text font-bold text-sm mt-1">{stat.value}</p>
              <p className="text-[10px] text-wc-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Season Leaderboard */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-3">تصنيف كأس العالم</h3>
        <div className="space-y-1.5">
          {mockLeaderboard.slice(0, 5).map((user) => (
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
                {user.username} {user.isCurrentUser && <span className="text-wc-accent">(أنت)</span>}
              </span>
              <span className="text-xs font-mono text-wc-accent">{user.points}</span>
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
              reminded
                ? "bg-wc-accent text-wc-accent-foreground"
                : "bg-wc-elevated text-wc-accent"
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
        <button className="px-3 py-1.5 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">
          شارك
        </button>
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
