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

      {/* Match Hero — Cinematic Style */}
      <div className="mx-4 rounded-2xl overflow-hidden" style={{ background: "var(--wc-gradient-hero)" }}>
        {/* Team Visual Area */}
        <div className="relative h-52 flex items-end justify-center">
          {/* Background gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-wc-surface/90" />
          
          {/* Team flags — large dramatic display */}
          <div className="relative z-10 flex items-end justify-center w-full px-6 pb-0">
            {/* Team A (Right in RTL) */}
            <div className="flex-1 flex justify-center">
              <div className="relative">
                <span className="text-8xl drop-shadow-2xl">🇮🇶</span>
              </div>
            </div>
            
            {/* VS / Score overlay */}
            <div className="flex-shrink-0 px-2 pb-4 z-20">
              {phase === "pre" ? (
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-wc-surface/80 border border-wc-border backdrop-blur-sm">
                  <span className="text-wc-text font-bold text-sm">VS</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-wc-text font-bold text-4xl drop-shadow-lg">{scoreA}</span>
                  <span className="text-wc-muted text-lg">-</span>
                  <span className="text-wc-text font-bold text-4xl drop-shadow-lg">{scoreB}</span>
                </div>
              )}
            </div>

            {/* Team B (Left in RTL) */}
            <div className="flex-1 flex justify-center">
              <div className="relative">
                <span className="text-8xl drop-shadow-2xl">🇩🇪</span>
              </div>
            </div>
          </div>
        </div>

        {/* Team Names + Match Info */}
        <div className="text-center px-5 pb-5 -mt-2">
          <h2 className="text-wc-text font-bold text-xl tracking-wide">
            العراق - ألمانيا
          </h2>
          
          {phase === "live" && (
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full animate-pulse bg-wc-danger" />
              <span className="text-xs font-bold text-wc-danger">67' مباشر</span>
            </div>
          )}
          {phase === "post" && (
            <span className="text-xs px-3 py-1 rounded-full mt-2 inline-block bg-wc-elevated text-wc-muted">
              نهاية المباراة
            </span>
          )}

          <p className="text-[11px] mt-3 text-wc-secondary">
            الأربعاء 18 يونيو 2026 · 9:00 م بتوقيت بغداد
          </p>

          {phase === "pre" && (
            <div className="mt-4">
              <p className="text-[11px] mb-2 text-wc-muted">تبدأ المباراة خلال</p>
              <div className="flex items-center justify-center gap-2">
                {[
                  { val: countdown.h, label: "ساعة" },
                  { val: countdown.m, label: "دقيقة" },
                  { val: countdown.s, label: "ثانية" },
                ].map((unit, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <span className="text-wc-text font-mono text-2xl font-bold bg-wc-elevated/60 rounded-lg px-3 py-1.5 min-w-[3rem] text-center border border-wc-border/50">
                        {String(unit.val).padStart(2, "0")}
                      </span>
                      <span className="text-[9px] text-wc-muted mt-1">{unit.label}</span>
                    </div>
                    {i < 2 && <span className="text-wc-accent font-bold text-xl animate-pulse -mt-4">:</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === "live" && (
            <button className="mt-4 px-6 py-2 rounded-full text-sm font-bold text-wc-accent-foreground inline-flex items-center gap-1.5 bg-wc-danger">
              شاهد على TOD
            </button>
          )}
        </div>
      </div>

      <PhaseIndicator activePhase={phase} onPhaseChange={setPhase} />

      {phase === "pre" && <PreGame todActivated={todActivated} onActivateTod={() => setTodActivated(true)} />}
      {phase === "live" && <InGame />}
      {phase === "post" && <PostGame />}
    </div>
  );
};

export default MatchHub;
