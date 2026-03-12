import { useState, useEffect } from "react";
import { ArrowRight, Cast, Share2, Heart, Bell } from "lucide-react";
import PhaseIndicator from "./PhaseIndicator";
import PreGame from "./PreGame";
import InGame from "./InGame";
import PostGame from "./PostGame";
import type { UserProfile } from "@/pages/WorldCup";

type Phase = "pre" | "live" | "post";

interface MatchHubProps {
  onBack: () => void;
  onNavigateToSubscription?: () => void;
  userProfile?: UserProfile | null;
}

const MatchHub = ({ onBack, onNavigateToSubscription, userProfile }: MatchHubProps) => {
  const [phase, setPhase] = useState<Phase>("pre");
  const [todActivated, setTodActivated] = useState(false);
  const [countdown, setCountdown] = useState({ h: 2, m: 34, s: 15 });
  const [reminded, setReminded] = useState(false);
  const [liked, setLiked] = useState(false);

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

      {/* ── Phase Tabs (prototype visualization) ──────────────────── */}
      <PhaseIndicator activePhase={phase} onPhaseChange={setPhase} />

      {/* ── Full-bleed Hero ───────────────────────────────────────────────── */}
      {/* No horizontal margin — goes edge to edge like the TOD screenshot   */}
      <div className="relative w-full" style={{ height: 300 }}>

        {/* Sky background — dark, cinematic */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(175deg, #0d1f12 0%, #0a0f1a 55%, #080d10 100%)",
          }}
        />

        {/* Subtle team-colour glows emanating from each side */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 15% 80%, rgba(0,100,40,0.35) 0%, transparent 70%), " +
              "radial-gradient(ellipse 55% 70% at 85% 80%, rgba(220,220,220,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Iraq flag — positioned left, large, slight inward tilt */}
        <div
          className="absolute select-none"
          style={{
            left: "4%",
            bottom: "72px",
            fontSize: 110,
            lineHeight: 1,
            transform: "rotate(8deg) scaleX(-1)",
            filter: "drop-shadow(0 12px 32px rgba(0,140,60,0.5))",
          }}
        >
          🇮🇶
        </div>

        {/* Germany flag — positioned right, slightly smaller, inward tilt */}
        <div
          className="absolute select-none"
          style={{
            right: "4%",
            bottom: "80px",
            fontSize: 96,
            lineHeight: 1,
            transform: "rotate(-8deg)",
            filter: "drop-shadow(0 12px 28px rgba(180,160,0,0.35))",
          }}
        >
          🇩🇪
        </div>

        {/* VS / Score pill — centred vertically in flag zone */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ bottom: 100 }}
        >
          {phase === "pre" ? (
            <div
              className="flex items-center justify-center rounded-full border border-white/20"
              style={{
                width: 48,
                height: 48,
                background: "rgba(255,255,255,0.10)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span className="text-white font-bold text-sm">VS</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-4xl font-mono drop-shadow-lg">{scoreA}</span>
              <span className="text-white/50 text-2xl">-</span>
              <span className="text-white font-bold text-4xl font-mono drop-shadow-lg">{scoreB}</span>
            </div>
          )}
        </div>

        {/* Live dot */}
        {phase === "live" && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ bottom: 60, background: "rgba(220,40,40,0.9)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] text-white font-bold">67' مباشر</span>
          </div>
        )}

        {/* Dark gradient rise from bottom — title sits on top of this */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: 130,
            background:
              "linear-gradient(to top, rgba(8,8,12,1) 0%, rgba(8,8,12,0.85) 50%, transparent 100%)",
          }}
        />

        {/* Match title — inside the hero, on top of gradient */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 z-10 text-right">
          <h1 className="text-white font-bold leading-tight" style={{ fontSize: 26 }}>
            العراق - ألمانيا
          </h1>
          {phase === "post" && (
            <span className="text-xs text-white/50 mt-1 inline-block">نهاية المباراة</span>
          )}
        </div>

        {/* Floating nav icons */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-20">
          <button onClick={onBack}>
            <ArrowRight size={22} className="text-white drop-shadow-lg" />
          </button>
          <Cast size={20} className="text-white/80 drop-shadow-lg" />
        </div>
      </div>
      {/* ── End Hero ─────────────────────────────────────────────────────── */}

      {/* ── Action Row ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        {/* Share */}
        <button
          className="flex items-center justify-center rounded-xl bg-wc-surface border border-wc-border shrink-0"
          style={{ width: 46, height: 46 }}
        >
          <Share2 size={17} className="text-wc-text" />
        </button>

        {/* Heart */}
        <button
          onClick={() => setLiked((v) => !v)}
          className={`flex items-center justify-center rounded-xl border shrink-0 transition-colors ${
            liked ? "bg-rose-500 border-rose-500" : "bg-wc-surface border-wc-border"
          }`}
          style={{ width: 46, height: 46 }}
        >
          <Heart size={17} className={liked ? "text-white fill-white" : "text-wc-text"} />
        </button>

        {/* ذكرني — only in pre-game */}
        {phase === "pre" && (
          <button
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-white"
            style={{ height: 46, background: "#22c55e" }}
          >
            <Bell size={15} className="fill-white text-white" />
            <span>ذكّرني</span>
          </button>
        )}

        {/* شاهد على TOD — only in live */}
        {phase === "live" && (
          <button
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-wc-accent-foreground bg-wc-accent"
            style={{ height: 46 }}
          >
            <span>شاهد على TOD 📺</span>
          </button>
        )}

        {/* Post-game — disabled */}
        {phase === "post" && (
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm bg-wc-elevated border border-wc-border text-wc-muted opacity-60 cursor-not-allowed"
            style={{ height: 46 }}
          >
            <span>اللعبة انتهت</span>
          </button>
        )}
      </div>

      {/* ── Tag Pills ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pb-1 flex-row-reverse">
        {["كرة القدم", "تعليق عربي", "2026"].map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full text-[11px] text-wc-muted bg-wc-elevated border border-wc-border whitespace-nowrap"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* ── Date + countdown (pre-game) ───────────────────────────────────── */}
      {phase === "pre" && (
        <div className="px-4 pt-4 pb-2 text-right">
          <p className="text-xs text-wc-muted font-medium">
            الأربعاء 18 يونيو 2026 · 9:00 م بتوقيت بغداد
          </p>

          {/* Countdown */}
          <div className="mt-4 mb-1">
            <p className="text-[11px] text-wc-muted mb-2 text-center">تبدأ المباراة خلال</p>
            <div className="flex items-end justify-center gap-2">
              {[
                { val: countdown.h, label: "ساعة" },
                { val: countdown.m, label: "دقيقة" },
                { val: countdown.s, label: "ثانية" },
              ].map((unit, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex flex-col items-center">
                    <span
                      className="text-wc-text font-mono font-bold rounded-xl text-center border border-wc-border/60"
                      style={{
                        fontSize: 28,
                        minWidth: "3.2rem",
                        padding: "6px 10px",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      {String(unit.val).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] text-wc-muted mt-1">{unit.label}</span>
                  </div>
                  {i < 2 && (
                    <span className="text-wc-accent font-bold text-2xl animate-pulse mb-5">:</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="h-px mx-4 my-3 bg-wc-border" />

      {/* ── Phase Engagement Layer ─────────────────────────────────── */}

      {phase === "pre" && (
        <PreGame
          todActivated={todActivated}
          onActivateTod={() => setTodActivated(true)}
          onNavigateToSubscription={onNavigateToSubscription}
          userId={userProfile?.id ?? null}
          username={userProfile?.username ?? userProfile?.display_name ?? null}
        />
      )}
      {phase === "live" && (
        <InGame
          userId={userProfile?.id ?? null}
          username={userProfile?.username ?? userProfile?.display_name ?? null}
        />
      )}
      {phase === "post" && <PostGame />}
    </div>
  );
};

export default MatchHub;
