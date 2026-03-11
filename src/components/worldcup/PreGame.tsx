import { useState } from "react";
import { Share2, Users, MessageCircle } from "lucide-react";
import { mockMatchFacts, mockChatMessages } from "@/lib/worldcupMockData";
import todLogo from "@/assets/tod-logo.png";

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
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center gap-2 mb-3" style={{ direction: "ltr" }}>
          <div className="px-2 py-1 rounded text-xs font-bold text-wc-accent-foreground bg-wc-danger">TOD</div>
          <span className="text-wc-text text-sm font-medium">هذه المباراة تُبث مباشرة على TOD</span>
        </div>
        {!todActivated ? (
          <div className="space-y-2">
            <p className="text-xs text-wc-muted">✅ اشتراكك في 1001 يشمل TOD</p>
            <p className="text-xs text-wc-muted">📲 اضغط أدناه لتفعيل حسابك في TOD</p>
            <p className="text-xs text-wc-muted">📺 افتح تطبيق TOD لمشاهدة المباراة</p>
            <button onClick={onActivateTod} className="w-full mt-2 py-2.5 rounded-full font-bold text-wc-accent-foreground text-sm bg-wc-accent">
              فعّل TOD
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <div>
              <p className="text-wc-text text-sm font-medium">أنت جاهز!</p>
              <p className="text-xs text-wc-muted">افتح TOD عند بداية المباراة</p>
            </div>
            <button className="mr-auto px-3 py-1.5 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">
              فتح TOD
            </button>
          </div>
        )}
      </div>

      {/* Match Facts */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-3">إحصائيات المواجهة</h3>
        <div className="flex justify-center gap-6 mb-3">
          <div className="text-center">
            <p className="text-wc-text font-bold text-lg">{mockMatchFacts.headToHead.teamAWins}</p>
            <p className="text-[10px] text-wc-muted">فوز العراق</p>
          </div>
          <div className="text-center">
            <p className="text-wc-text font-bold text-lg">{mockMatchFacts.headToHead.draws}</p>
            <p className="text-[10px] text-wc-muted">تعادل</p>
          </div>
          <div className="text-center">
            <p className="text-wc-text font-bold text-lg">{mockMatchFacts.headToHead.teamBWins}</p>
            <p className="text-[10px] text-wc-muted">فوز ألمانيا</p>
          </div>
        </div>
        <div className="flex justify-center gap-3">
          <div className="flex gap-1">
            {mockMatchFacts.form.teamA.map((r, i) => (
              <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-wc-accent-foreground ${
                r === "W" ? "bg-wc-accent" : r === "D" ? "bg-wc-warning" : "bg-wc-danger"
              }`}>
                {r}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            {mockMatchFacts.form.teamB.map((r, i) => (
              <span key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-wc-accent-foreground ${
                r === "W" ? "bg-wc-accent" : r === "D" ? "bg-wc-warning" : "bg-wc-danger"
              }`}>
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Prediction */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-3">من سيفوز؟</h3>
        <div className="flex gap-2">
          {[
            { key: "A", label: "🇮🇶 العراق" },
            { key: "draw", label: "تعادل" },
            { key: "B", label: "🇩🇪 ألمانيا" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPrediction(opt.key)}
              className={`flex-1 py-2.5 rounded-full text-xs font-bold transition-all ${
                prediction === opt.key
                  ? "bg-wc-accent text-wc-accent-foreground"
                  : "bg-wc-elevated text-wc-muted"
              }`}
            >
              <div>{opt.label}</div>
              {prediction && <div className="text-[10px] mt-0.5">{getVotePercent(opt.key)}%</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Fan Chat Preview */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <h3 className="text-wc-text font-bold text-sm mb-3">دردشة المشجعين</h3>
        <div className="space-y-2 mb-3">
          {mockChatMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2" style={{ direction: "rtl" }}>
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] text-wc-text font-bold bg-wc-elevated">
                {msg.username[0]}
              </div>
              <div className="rounded-xl px-3 py-2 bg-wc-elevated">
                <span className="text-[10px] font-bold text-wc-accent">{msg.username}</span>
                <p className="text-wc-text text-xs">{msg.message}</p>
              </div>
              <span className="text-[9px] mt-2 text-wc-muted">{msg.timestamp}</span>
            </div>
          ))}
        </div>
        <button className="w-full py-2 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">
          <MessageCircle size={14} className="inline ml-1" />
          انضم لدردشة المشجعين العراقيين
        </button>
      </div>

      {/* Watch Party */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center gap-2 mb-2">
          <Users size={16} className="text-wc-accent" />
          <h3 className="text-wc-text font-bold text-sm">حفلة مشاهدة</h3>
        </div>
        <p className="text-xs mb-3 text-wc-muted">ادعُ أصدقاءك للمشاهدة معاً</p>
        <div className="flex items-center gap-2 mb-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-wc-text bg-wc-elevated border-2 border-wc-accent">
              +
            </div>
          ))}
        </div>
        <button className="w-full py-2.5 rounded-full font-bold text-wc-accent-foreground text-xs bg-wc-accent">
          إنشاء حفلة مشاهدة
        </button>
      </div>

      {/* Invite */}
      <div className="rounded-2xl p-4 flex items-center gap-3 bg-wc-surface border border-wc-border">
        <Share2 size={20} className="text-wc-accent" />
        <div className="flex-1">
          <p className="text-wc-text text-sm font-bold">شارك مع صديق</p>
          <p className="text-[10px] text-wc-muted">ادعُ أصدقاءك لتجربة 1001</p>
        </div>
        <button className="px-3 py-1.5 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">
          شارك
        </button>
      </div>
    </div>
  );
};

export default PreGame;
