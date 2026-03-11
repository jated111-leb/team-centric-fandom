import { useState, useEffect } from "react";
import { ArrowRight, Share2 } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import PreGame from "./PreGame";
import InGame from "./InGame";
import PostGame from "./PostGame";

type Phase = "pre" | "live" | "post";

interface MatchHubProps {
  onBack: () => void;
  onNavigateToSubscription?: () => void;
}

const MatchHub = ({ onBack, onNavigateToSubscription }: MatchHubProps) => {
  const [phase, setPhase] = useState<Phase>("pre");
  const [todActivated, setTodActivated] = useState(false);
  const [countdown, setCountdown] = useState({ h: 2, m: 34, s: 15 });

  useEffect(() => {
    if (phase !== "pre") return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        let { h, m, s } = prev;
        s--;
        if (s < 0) { s = 59; m--; }
        if (m < 0) { m = 59; h--; }
        if (h < 0) return { h: 0, m: 0, s: 0 };
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const scoreA = phase !== "pre" ? 2 : null;
  const scoreB = phase !== "pre" ? 1 : null;

  return (
    <div className="flex-1 overflow-y-auto bg-wc-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 text-wc-text">
          <Share2 size={18} />
          
        </div>
        <button onClick={onBack} className="text-wc-text">
          <ArrowRight size={20} />
        </button>
      </div>

      {/* Match Hero */}
      <div className="mx-4 rounded-2xl p-5 text-center" style={{ background: "var(--wc-gradient-hero)" }}>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <span className="text-3xl">🇩🇪</span>
            <p className="text-wc-text text-xs font-bold mt-1">ألمانيا</p>
          </div>
          <div className="text-center px-4">
            {phase === "pre" ? (
              <p className="text-wc-text font-bold text-sm">VS</p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-wc-text font-bold text-3xl">{scoreB}</span>
                <span className="text-xs text-wc-muted">-</span>
                <span className="text-wc-text font-bold text-3xl">{scoreA}</span>
              </div>
            )}
            {phase === "live" && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-2 h-2 rounded-full animate-pulse bg-wc-danger" />
                <span className="text-[10px] font-bold text-wc-danger">67' مباشر</span>
              </div>
            )}
            {phase === "post" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block bg-wc-elevated text-wc-muted">
                نهاية المباراة
              </span>
            )}
          </div>
          <div className="text-center">
            <span className="text-3xl">🇮🇶</span>
            <p className="text-wc-text text-xs font-bold mt-1">العراق</p>
          </div>
        </div>

        <p className="text-[10px] mt-2 text-wc-muted">
          الأربعاء 18 يونيو 2026 · 9:00 م بتوقيت بغداد
        </p>

        {phase === "pre" && (
          <div className="mt-3">
            <p className="text-[10px] mb-1 text-wc-muted">تبدأ المباراة خلال</p>
            <div className="flex items-center justify-center gap-1 text-wc-text font-mono text-2xl font-bold">
              <span>{String(countdown.h).padStart(2, "0")}</span>
              <span className="animate-pulse">:</span>
              <span>{String(countdown.m).padStart(2, "0")}</span>
              <span className="animate-pulse">:</span>
              <span>{String(countdown.s).padStart(2, "0")}</span>
            </div>
          </div>
        )}

        {phase === "live" && (
          <button className="mt-3 px-4 py-1.5 rounded-full text-xs font-bold text-wc-accent-foreground inline-flex items-center gap-1 bg-wc-danger">
            شاهد على TOD
          </button>
        )}
      </div>

      <PhaseIndicator activePhase={phase} onPhaseChange={setPhase} />

      {phase === "pre" && <PreGame todActivated={todActivated} onActivateTod={() => setTodActivated(true)} />}
      {phase === "live" && <InGame />}
      {phase === "post" && <PostGame />}
    </div>
  );
};

export default MatchHub;
