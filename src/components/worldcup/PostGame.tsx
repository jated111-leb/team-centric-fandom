import { useState } from "react";
import { Star, Bell, Share2, ArrowUp, ChevronLeft } from "lucide-react";
import { mockLeaderboard, mockHighlights } from "@/lib/worldcupMockData";

const PostGame = () => {
  const [rating, setRating] = useState(0);
  const [reminded, setReminded] = useState(false);

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* Man of the Match */}
      <div className="rounded-2xl p-4 text-center" style={{ background: "linear-gradient(135deg, #161B22 0%, #0D2818 100%)" }}>
        <p className="text-xs mb-1" style={{ color: "#F39C12" }}>⭐ رجل المباراة</p>
        <div className="w-16 h-16 rounded-full mx-auto mb-2 flex items-center justify-center text-2xl" style={{ background: "#1C2128", border: "2px solid #F39C12" }}>
          ⚽
        </div>
        <h3 className="text-white font-bold text-base">أيمن حسين</h3>
        <p className="text-xs" style={{ color: "#8B949E" }}>هدفان · 3 تسديدات · تمريرة حاسمة</p>
      </div>

      {/* Your Match Stats */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">إحصائياتك</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "النقاط المكتسبة", value: "+85", icon: "🏆" },
            { label: "دقة التوقعات", value: "75%", icon: "🎯" },
            { label: "نتيجة التوقع", value: "صحيح ✅", icon: "📊" },
            { label: "تغيير الترتيب", value: "↑ 3", icon: "📈" },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl p-3 text-center" style={{ background: "#1C2128" }}>
              <span className="text-lg">{stat.icon}</span>
              <p className="text-white font-bold text-sm mt-1">{stat.value}</p>
              <p className="text-[10px]" style={{ color: "#8B949E" }}>{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Season Leaderboard */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">تصنيف كأس العالم</h3>
        <div className="space-y-1.5">
          {mockLeaderboard.slice(0, 5).map((user) => (
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
                {user.username} {user.isCurrentUser && <span style={{ color: "#2ECC71" }}>(أنت)</span>}
              </span>
              <span className="text-xs font-mono" style={{ color: "#2ECC71" }}>{user.points}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Highlights */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">أبرز اللحظات</h3>
        <div className="grid grid-cols-2 gap-2">
          {mockHighlights.map((h) => (
            <div key={h.id} className="rounded-xl overflow-hidden relative" style={{ background: "#1C2128" }}>
              <div className="h-20 flex items-center justify-center text-2xl" style={{ background: "linear-gradient(135deg, #1C2128, #0D2818)" }}>
                🎬
              </div>
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold text-white" style={{ background: "#E74C3C" }}>
                TOD
              </div>
              <div className="p-2">
                <p className="text-white text-[10px] font-medium leading-tight">{h.title}</p>
                <p className="text-[9px] mt-0.5" style={{ color: "#8B949E" }}>{h.minute}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Match Reminder */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-2">المباراة القادمة</h3>
        <div className="flex items-center justify-between">
          <div className="text-right">
            <p className="text-white text-xs">🇮🇶 العراق vs الأردن 🇯🇴</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#8B949E" }}>الجمعة 20 يونيو · 9:00 م</p>
          </div>
          <button
            onClick={() => setReminded(!reminded)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: reminded ? "#2ECC71" : "#1C2128",
              color: reminded ? "#fff" : "#2ECC71",
            }}
          >
            <Bell size={14} />
            {reminded ? "تم التذكير" : "ذكّرني"}
          </button>
        </div>
      </div>

      {/* Invite */}
      <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "#161B22" }}>
        <Share2 size={20} color="#2ECC71" />
        <div className="flex-1">
          <p className="text-white text-sm font-bold">ادعُ صديقاً للمباراة القادمة</p>
          <p className="text-[10px]" style={{ color: "#8B949E" }}>شارك التجربة مع أصدقائك</p>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ color: "#2ECC71", border: "1px solid #2ECC71" }}>
          شارك
        </button>
      </div>

      {/* Rate Experience */}
      <div className="rounded-2xl p-4 text-center" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-2">قيّم التجربة</h3>
        <div className="flex justify-center gap-2 mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} onClick={() => setRating(s)}>
              <Star size={24} color={s <= rating ? "#F39C12" : "#1C2128"} fill={s <= rating ? "#F39C12" : "none"} />
            </button>
          ))}
        </div>
        {rating > 0 && <p className="text-xs" style={{ color: "#2ECC71" }}>شكراً لتقييمك! ⭐</p>}
      </div>
    </div>
  );
};

export default PostGame;
