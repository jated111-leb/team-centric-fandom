import { useState, useEffect } from "react";
import { Share2 } from "lucide-react";
import { mockMatchFacts, worldcupQuizzes } from "@/lib/worldcupMockData";
import todLogo from "@/assets/tod-logo.png";

interface PreGameProps {
  todActivated: boolean;
  onActivateTod: () => void;
}

const preQuizzes = worldcupQuizzes.filter((q) => q.phase === "pre");

const PreGame = ({ todActivated, onActivateTod }: PreGameProps) => {
  const [prediction, setPrediction] = useState<string | null>(null);
  const [votes, setVotes] = useState({ A: 42, draw: 18, B: 40 });

  // Quiz state
  const [quizIndex, setQuizIndex] = useState(0);
  const [preQuizSelected, setPreQuizSelected] = useState<number | null>(null);
  const [preQuizAnswered, setPreQuizAnswered] = useState(false);

  const currentQuiz = preQuizzes[quizIndex % preQuizzes.length];

  // Simulate live vote trickle
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

  const total = votes.A + votes.draw + votes.B;
  const getVotePercent = (key: "A" | "draw" | "B") =>
    Math.round((votes[key] / total) * 100);

  const handleNextQuiz = () => {
    setQuizIndex((i) => i + 1);
    setPreQuizSelected(null);
    setPreQuizAnswered(false);
  };

  // Hype meter state
  const [hypeCount, setHypeCount] = useState(4237);
  const [hasTapped, setHasTapped] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setHypeCount((prev) => prev + Math.floor(Math.random() * 5) + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const hypeFill = Math.min((hypeCount / 10000) * 100, 100);
  const hypeTier =
    hypeCount < 2000
      ? { label: "الجمهور يتحرك...", barClass: "bg-wc-accent" }
      : hypeCount < 5000
      ? { label: "الملعب يشتعل! 🔥", barClass: "bg-wc-warning" }
      : { label: "العراق كله معاك! 💥", barClass: "bg-wc-danger" };

  return (
    <div className="space-y-4 px-4 pb-6">
      {/* ── Hub Framing Banner ──────────────────────────────────────────── */}
      <div className="rounded-xl px-4 py-3 flex items-start gap-3 bg-wc-elevated border border-wc-border">
        <span className="text-lg flex-shrink-0">🏠</span>
        <p className="text-xs leading-relaxed text-wc-muted">
          <span className="text-wc-text font-bold">1001 هو مركز تجربتك.</span>{" "}
          المباراة تُبث على TOD — لكن تجربة المشجع العراقي تبدأ وتنتهي هنا.
        </p>
      </div>

      {/* ── TOD Activation (pinned-comment style) ──────────────────────── */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] px-2 py-0.5 rounded font-bold text-wc-accent-foreground bg-wc-accent">
            📌 مثبّت
          </span>
          <div className="flex items-center gap-1.5" style={{ direction: "ltr" }}>
            <img src={todLogo} alt="TOD" className="h-5 w-auto" />
          </div>
          <span className="text-wc-text text-sm font-medium">هذه المباراة تُبث مباشرة على</span>
        </div>
        {!todActivated ? (
          <div className="space-y-1.5">
            <p className="text-xs text-wc-muted">✅ اشتراكك في 1001 يشمل TOD</p>
            <p className="text-xs text-wc-muted">📲 اضغط أدناه لتفعيل حسابك في TOD</p>
            <p className="text-xs text-wc-muted">📺 افتح تطبيق TOD عند بداية المباراة</p>
            <button
              onClick={onActivateTod}
              className="w-full mt-2 py-2.5 rounded-full font-bold text-wc-accent-foreground text-sm bg-wc-accent"
            >
              فعّل TOD الآن
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

      {/* ── Prediction (with live vote trickle) ─────────────────────────── */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-wc-text font-bold text-sm">من سيفوز؟</h3>
          {prediction && (
            <span className="text-[10px] text-wc-muted">{total.toLocaleString()} صوت</span>
          )}
        </div>
        <div className="flex gap-2">
          {(
            [
              { key: "A" as const, label: "🇮🇶 العراق" },
              { key: "draw" as const, label: "تعادل" },
              { key: "B" as const, label: "🇩🇪 ألمانيا" },
            ] as const
          ).map((opt) => (
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
              {prediction && (
                <div className="text-[10px] mt-0.5 opacity-80">
                  {getVotePercent(opt.key)}%
                </div>
              )}
            </button>
          ))}
        </div>
        {prediction && (
          <p className="text-[10px] text-center mt-2 text-wc-muted">
            {prediction === "A"
              ? `${getVotePercent("A")}٪ من المشجعين العراقيين يتفقون معك 🇮🇶`
              : prediction === "B"
              ? `${getVotePercent("B")}٪ يتوقعون فوز ألمانيا`
              : `${getVotePercent("draw")}٪ يتوقعون التعادل`}
          </p>
        )}
      </div>

      {/* ── Pre-Match Trivia Quiz ────────────────────────────────────────── */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-wc-text font-bold text-sm">🧠 اختبار المعرفة</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-wc-elevated text-wc-muted border border-wc-border">
            +{currentQuiz.points} نقطة
          </span>
        </div>
        <p className="text-wc-text text-xs mb-3 leading-relaxed">{currentQuiz.question}</p>
        <div className="grid grid-cols-2 gap-2">
          {currentQuiz.options.map((opt, i) => {
            let cls = "bg-wc-elevated text-wc-muted";
            if (preQuizAnswered) {
              if (i === currentQuiz.correctIndex)
                cls = "bg-wc-accent text-wc-accent-foreground";
              else if (i === preQuizSelected)
                cls = "bg-wc-danger text-wc-accent-foreground";
            } else if (i === preQuizSelected) {
              cls = "bg-wc-accent text-wc-accent-foreground";
            }
            return (
              <button
                key={i}
                onClick={() => {
                  if (preQuizAnswered) return;
                  setPreQuizSelected(i);
                  setPreQuizAnswered(true);
                }}
                disabled={preQuizAnswered}
                className={`py-2.5 rounded-full text-xs font-medium transition-all ${cls}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {preQuizAnswered && (
          <div className="mt-2 flex items-center justify-between">
            <p
              className={`text-xs font-bold ${
                preQuizSelected === currentQuiz.correctIndex
                  ? "text-wc-accent"
                  : "text-wc-danger"
              }`}
            >
              {preQuizSelected === currentQuiz.correctIndex
                ? `🎉 إجابة صحيحة! +${currentQuiz.points} نقطة`
                : `❌ الإجابة: ${currentQuiz.options[currentQuiz.correctIndex]}`}
            </p>
            <button onClick={handleNextQuiz} className="text-[10px] text-wc-accent underline">
              السؤال التالي ›
            </button>
          </div>
        )}
      </div>

      {/* ── Crowd Hype Meter ─────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-wc-text font-bold text-sm">حرارة الجمهور 🔥</h3>
          <span className="text-[10px] text-wc-muted font-mono">
            {hypeCount.toLocaleString("ar-EG")} مشجع
          </span>
        </div>

        {/* Fill bar */}
        <div className="h-2.5 rounded-full mb-1 overflow-hidden bg-wc-elevated">
          <div
            className={`h-full rounded-full transition-all duration-700 ${hypeTier.barClass}`}
            style={{ width: `${hypeFill}%` }}
          />
        </div>
        <p className="text-[10px] text-wc-muted text-center mb-4">{hypeTier.label}</p>

        {/* Tap button */}
        {!hasTapped ? (
          <button
            onClick={() => {
              setHasTapped(true);
              setHypeCount((prev) => prev + 1);
            }}
            className="w-full py-3 rounded-full font-bold text-wc-accent-foreground text-sm bg-wc-accent active:scale-95 transition-transform"
          >
            أشعل الحماس 🔥
          </button>
        ) : (
          <div className="w-full py-3 rounded-full text-center text-xs font-bold bg-wc-elevated text-wc-accent border border-wc-accent">
            أنت من بين {hypeCount.toLocaleString("ar-EG")} مشجع عراقي ✅
          </div>
        )}
      </div>

      {/* ── Invite a Friend ──────────────────────────────────────────────── */}
      <div className="rounded-2xl p-4 flex items-center gap-3 bg-wc-surface border border-wc-border">
        <Share2 size={20} className="text-wc-accent flex-shrink-0" />
        <div className="flex-1">
          <p className="text-wc-text text-sm font-bold">ادعُ صديقاً</p>
          <p className="text-[10px] text-wc-muted">شاركه الرابط وينضم للدردشة</p>
        </div>
        <button className="px-3 py-1.5 rounded-full text-xs font-bold text-wc-accent border border-wc-accent">
          شارك
        </button>
      </div>
    </div>
  );
};

export default PreGame;
