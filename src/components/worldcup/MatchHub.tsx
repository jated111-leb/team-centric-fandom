import { useState, useEffect } from "react";
import { ArrowRight, Cast, Share2 } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import PreGame from "./PreGame";
import InGame from "./InGame";
import PostGame from "./PostGame";

type Phase = "pre" | "live" | "post";

interface MatchHubProps {
  onBack: () => void;
}

const MatchHub = ({ onBack }: MatchHubProps) => {
  const [phase, setPhase] = useState<Phase>("pre");
  const [todActivated, setTodActivated] = useState(false);
  const [countdown, setCountdown] = useState({ h: 2, m: 34, s: 15 });

  // Countdown timer for pre-game
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
    <div className="flex-1 overflow-y-auto" style={{ background: "#0D1117" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Share2 size={18} color="#fff" />
          <Cast size={18} color="#fff" />
        </div>
        <button onClick={onBack}>
          <ArrowRight size={20} color="#fff" />
        </button>
      </div>

      {/* Match Hero */}
      <div className="mx-4 rounded-2xl p-5 text-center" style={{ background: "linear-gradient(180deg, #0D2818 0%, #161B22 100%)" }}>
        {/* Teams */}
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <span className="text-3xl">🇩🇪</span>
            <p className="text-white text-xs font-bold mt-1">ألمانيا</p>
          </div>
          <div className="text-center px-4">
            {phase === "pre" ? (
              <p className="text-white font-bold text-sm">VS</p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-3xl">{scoreB}</span>
                <span className="text-xs" style={{ color: "#8B949E" }}>-</span>
                <span className="text-white font-bold text-3xl">{scoreA}</span>
              </div>
            )}
            {phase === "live" && (
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#E74C3C" }} />
                <span className="text-[10px] font-bold" style={{ color: "#E74C3C" }}>67' مباشر</span>
              </div>
            )}
            {phase === "post" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background: "#1C2128", color: "#8B949E" }}>
                نهاية المباراة
              </span>
            )}
          </div>
          <div className="text-center">
            <span className="text-3xl">🇮🇶</span>
            <p className="text-white text-xs font-bold mt-1">العراق</p>
          </div>
        </div>

        {/* Date & Time */}
        <p className="text-[10px] mt-2" style={{ color: "#8B949E" }}>
          الأربعاء 18 يونيو 2026 · 9:00 م بتوقيت بغداد
        </p>

        {/* Countdown (pre only) */}
        {phase === "pre" && (
          <div className="mt-3">
            <p className="text-[10px] mb-1" style={{ color: "#8B949E" }}>تبدأ المباراة خلال</p>
            <div className="flex items-center justify-center gap-1 text-white font-mono text-2xl font-bold">
              <span>{String(countdown.h).padStart(2, "0")}</span>
              <span className="animate-pulse">:</span>
              <span>{String(countdown.m).padStart(2, "0")}</span>
              <span className="animate-pulse">:</span>
              <span>{String(countdown.s).padStart(2, "0")}</span>
            </div>
          </div>
        )}

        {/* Live — Watch on TOD */}
        {phase === "live" && (
          <button className="mt-3 px-4 py-1.5 rounded-full text-xs font-bold text-white inline-flex items-center gap-1" style={{ background: "#E74C3C" }}>
            شاهد على TOD
          </button>
        )}
      </div>

      {/* Phase Indicator */}
      <PhaseIndicator activePhase={phase} onPhaseChange={setPhase} />

      {/* Phase Content */}
      {phase === "pre" && <PreGame todActivated={todActivated} onActivateTod={() => setTodActivated(true)} />}
      {phase === "live" && <InGame />}
      {phase === "post" && <PostGame />}
    </div>
  );
};

export default MatchHub;
