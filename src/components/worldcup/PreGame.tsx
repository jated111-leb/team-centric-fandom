import { useState } from "react";
import { Share2, Users, MessageCircle, Crown } from "lucide-react";
import { mockLineups, mockMatchFacts, mockChatMessages } from "@/lib/worldcupMockData";

interface PreGameProps {
  todActivated: boolean;
  onActivateTod: () => void;
}

const PreGame = ({ todActivated, onActivateTod }: PreGameProps) => {
  const [prediction, setPrediction] = useState<string | null>(null);
  const votes = { A: 42, draw: 18, B: 40 };

  const getVotePercent = (key: string) => {
    const total = votes.A + votes.draw + votes.B;
    const val = key === "A" ? votes.A : key === "draw" ? votes.draw : votes.B;
    return Math.round((val / total) * 100);
  };

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* TOD Activation */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <div className="flex items-center gap-2 mb-3" style={{ direction: "ltr" }}>
          <div className="px-2 py-1 rounded text-xs font-bold text-white" style={{ background: "#E74C3C" }}>TOD</div>
          <span className="text-white text-sm font-medium">هذه المباراة تُبث مباشرة على TOD</span>
        </div>
        {!todActivated ? (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "#8B949E" }}>✅ اشتراكك في 1001 يشمل TOD</p>
            <p className="text-xs" style={{ color: "#8B949E" }}>📲 اضغط أدناه لتفعيل حسابك في TOD</p>
            <p className="text-xs" style={{ color: "#8B949E" }}>📺 افتح تطبيق TOD لمشاهدة المباراة</p>
            <button onClick={onActivateTod} className="w-full mt-2 py-2.5 rounded-xl font-bold text-white text-sm" style={{ background: "#2ECC71" }}>
              فعّل TOD
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <div>
              <p className="text-white text-sm font-medium">أنت جاهز!</p>
              <p className="text-xs" style={{ color: "#8B949E" }}>افتح TOD عند بداية المباراة</p>
            </div>
            <button className="mr-auto px-3 py-1.5 rounded-lg text-xs font-bold" style={{ color: "#2ECC71", border: "1px solid #2ECC71" }}>
              فتح TOD
            </button>
          </div>
        )}
      </div>

      {/* Lineups */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">التشكيلة</h3>
        <div className="grid grid-cols-2 gap-4" style={{ direction: "rtl" }}>
          {(["teamA", "teamB"] as const).map((team) => (
            <div key={team}>
              <div className="text-center mb-2">
                <span className="text-lg">{mockLineups[team].flag}</span>
                <p className="text-white text-xs font-bold">{mockLineups[team].name}</p>
                <p className="text-[10px]" style={{ color: "#8B949E" }}>{mockLineups[team].formation}</p>
              </div>
              <div className="space-y-1">
                {mockLineups[team].players.map((p, i) => (
                  <p key={i} className="text-[11px] text-right" style={{ color: "#8B949E" }}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Match Facts */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">إحصائيات المواجهة</h3>
        <div className="flex justify-center gap-6 mb-3">
          <div className="text-center">
            <p className="text-white font-bold text-lg">{mockMatchFacts.headToHead.teamAWins}</p>
            <p className="text-[10px]" style={{ color: "#8B949E" }}>فوز العراق</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-lg">{mockMatchFacts.headToHead.draws}</p>
            <p className="text-[10px]" style={{ color: "#8B949E" }}>تعادل</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-lg">{mockMatchFacts.headToHead.teamBWins}</p>
            <p className="text-[10px]" style={{ color: "#8B949E" }}>فوز السعودية</p>
          </div>
        </div>
        <div className="flex justify-center gap-3">
          <div className="flex gap-1">
            {mockMatchFacts.form.teamA.map((r, i) => (
              <span key={i} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: r === "W" ? "#2ECC71" : r === "D" ? "#F39C12" : "#E74C3C" }}>
                {r}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            {mockMatchFacts.form.teamB.map((r, i) => (
              <span key={i} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: r === "W" ? "#2ECC71" : r === "D" ? "#F39C12" : "#E74C3C" }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Prediction */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">من سيفوز؟</h3>
        <div className="flex gap-2">
          {[
            { key: "A", label: "🇮🇶 العراق" },
            { key: "draw", label: "تعادل" },
            { key: "B", label: "🇸🇦 السعودية" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPrediction(opt.key)}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: prediction === opt.key ? "#2ECC71" : "#1C2128",
                color: prediction === opt.key ? "#fff" : "#8B949E",
              }}
            >
              <div>{opt.label}</div>
              {prediction && <div className="text-[10px] mt-0.5">{getVotePercent(opt.key)}%</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Fan Chat Preview */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <h3 className="text-white font-bold text-sm mb-3">دردشة المشجعين</h3>
        <div className="space-y-2 mb-3">
          {mockChatMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2" style={{ direction: "rtl" }}>
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] text-white font-bold" style={{ background: "#1C2128" }}>
                {msg.username[0]}
              </div>
              <div className="rounded-xl px-3 py-2" style={{ background: "#1C2128" }}>
                <span className="text-[10px] font-bold" style={{ color: "#2ECC71" }}>{msg.username}</span>
                <p className="text-white text-xs">{msg.message}</p>
              </div>
              <span className="text-[9px] mt-2" style={{ color: "#8B949E" }}>{msg.timestamp}</span>
            </div>
          ))}
        </div>
        <button className="w-full py-2 rounded-xl text-xs font-bold" style={{ color: "#2ECC71", border: "1px solid #2ECC71" }}>
          <MessageCircle size={14} className="inline ml-1" />
          انضم لدردشة المشجعين العراقيين
        </button>
      </div>

      {/* Watch Party */}
      <div className="rounded-2xl p-4" style={{ background: "#161B22" }}>
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} color="#2ECC71" />
          <h3 className="text-white font-bold text-sm">حفلة مشاهدة</h3>
        </div>
        <p className="text-xs mb-3" style={{ color: "#8B949E" }}>ادعُ أصدقاءك للمشاهدة معاً</p>
        <div className="flex items-center gap-2 mb-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-white" style={{ background: "#1C2128", border: "2px solid #2ECC71" }}>
              +
            </div>
          ))}
        </div>
        <button className="w-full py-2.5 rounded-xl font-bold text-white text-xs" style={{ background: "#2ECC71" }}>
          إنشاء حفلة مشاهدة
        </button>
      </div>

      {/* Invite */}
      <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "#161B22" }}>
        <Share2 size={20} color="#2ECC71" />
        <div className="flex-1">
          <p className="text-white text-sm font-bold">شارك مع صديق</p>
          <p className="text-[10px]" style={{ color: "#8B949E" }}>ادعُ أصدقاءك لتجربة 1001</p>
        </div>
        <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ color: "#2ECC71", border: "1px solid #2ECC71" }}>
          شارك
        </button>
      </div>
    </div>
  );
};

export default PreGame;
