import { useState, useEffect } from "react";
import { ArrowRight, Cast, Share2, Heart, Bell, BellOff } from "lucide-react";
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

      {/* ── Hero Section ──────────────────────────────────────────────────── */}
      <div className="relative w-full" style={{ height: 260 }}>

        {/* Background gradient — team colours bleeding in from each side */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #1a3a1a 0%, #111 40%, #111 60%, #1a1a2e 100%)",
          }}
        />

        {/* Left player silhouette (Iraq) */}
        <div
          className="absolute bottom-0 left-0 flex flex-col items-center justify-end"
          style={{ width: "48%", height: "85%" }}
        >
          {/* Jersey silhouette */}
          <div className="relative flex flex-col items-center">
            {/* Head */}
            <div
              className="rounded-full mb-[-4px] z-10"
              style={{
                width: 52,
                height: 52,
                background: "linear-gradient(160deg, #c8a882 60%, #a0785a 100%)",
                boxShadow: "0 0 24px rgba(0,180,80,0.25)",
              }}
            />
            {/* Jersey */}
            <div
              style={{
                width: 90,
                height: 110,
                background: "linear-gradient(180deg, #006233 0%, #004d28 100%)",
                clipPath: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)",
                borderRadius: "6px 6px 0 0",
              }}
            />
            {/* Collar accent */}
            <div
              className="absolute top-[48px] left-1/2 -translate-x-1/2"
              style={{
                width: 32,
                height: 12,
                background: "#fff",
                clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)",
                opacity: 0.6,
              }}
            />
          </div>
        </div>

        {/* Right player silhouette (Germany) */}
        <div
          className="absolute bottom-0 right-0 flex flex-col items-center justify-end"
          style={{ width: "48%", height: "80%" }}
        >
          <div className="relative flex flex-col items-center">
            {/* Head */}
            <div
              className="rounded-full mb-[-4px] z-10"
              style={{
                width: 46,
                height: 46,
                background: "linear-gradient(160deg, #d4b896 60%, #b08860 100%)",
                boxShadow: "0 0 20px rgba(200,200,200,0.2)",
              }}
            />
            {/* Jersey */}
            <div
              style={{
                width: 82,
                height: 100,
                background: "linear-gradient(180deg, #f0f0f0 0%, #c8c8c8 100%)",
                clipPath: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)",
                borderRadius: "6px 6px 0 0",
              }}
            />
            {/* Collar accent */}
            <div
              className="absolute top-[44px] left-1/2 -translate-x-1/2"
              style={{
                width: 28,
                height: 10,
                background: "#000",
                clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)",
                opacity: 0.5,
              }}
            />
          </div>
        </div>

        {/* Gradient fade at bottom so text reads clearly */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: 120,
            background: "linear-gradient(to top, rgba(10,10,10,0.98) 0%, rgba(10,10,10,0.6) 60%, transparent 100%)",
          }}
        />

        {/* Top nav icons — float above hero */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-3 z-20">
          <Cast size={20} className="text-white drop-shadow" />
          <button onClick={onBack}>
            <ArrowRight size={20} className="text-white drop-shadow" />
          </button>
        </div>

        {/* Live badge (only during live phase) */}
        {phase === "live" && (
          <div className="absolute top-10 left-4 flex items-center gap-1 px-2.5 py-1 rounded-full bg-wc-danger z-20">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-bold text-white">مباشر</span>
          </div>
        )}

        {/* Match title at bottom of hero */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3 z-20">
          {/* Score row (live/post only) */}
          {phase !== "pre" && (
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="text-white font-bold text-3xl font-mono">{scoreB}</span>
              <span className="text-wc-muted text-lg">-</span>
              <span className="text-white font-bold text-3xl font-mono">{scoreA}</span>
            </div>
          )}
          <h1 className="text-white font-bold text-2xl text-right leading-tight">
            العراق - ألمانيا
          </h1>
        </div>
      </div>

      {/* ── Action Row ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        {/* Share */}
        <button className="flex items-center justify-center rounded-xl border border-wc-border bg-wc-surface"
          style={{ width: 44, height: 44 }}>
          <Share2 size={16} className="text-wc-text" />
        </button>

        {/* Like */}
        <button
          onClick={() => setLiked((v) => !v)}
          className={`flex items-center justify-center rounded-xl border transition-colors ${
            liked ? "bg-rose-500 border-rose-500" : "bg-wc-surface border-wc-border"
          }`}
          style={{ width: 44, height: 44 }}
        >
          <Heart size={16} className={liked ? "text-white fill-white" : "text-wc-text"} />
        </button>

        {/* Remind me — dominant CTA */}
        <button
          onClick={() => setReminded((v) => !v)}
          className={`flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm h-[44px] transition-all ${
            reminded
              ? "bg-[#22c55e] text-white border-0"
              : "bg-wc-surface border border-wc-border text-wc-muted"
          }`}
        >
          {reminded ? <Bell size={15} className="fill-white" /> : <Bell size={15} />}
          <span>ذكّرني</span>
        </button>
      </div>

      {/* ── Tag Pills ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pb-4 flex-row-reverse">
        {["كرة القدم", "تعليق عربي", "2026"].map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full text-[11px] text-wc-muted bg-wc-elevated border border-wc-border"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px mx-4 mb-4 bg-wc-border" />

      {/* ── Countdown (pre-game only) ──────────────────────────────────────── */}
      {phase === "pre" && (
        <div className="px-4 pb-4 text-right">
          <p className="text-xs text-wc-muted mb-1">الأربعاء 18 يونيو 2026 · 9:00 م بتوقيت بغداد</p>
          <p className="text-[11px] text-wc-muted mb-3 leading-relaxed">
            كأس العالم 2026: شاهد مباراة العراق ضد ألمانيا تبث مباشرة من أمريكا.
          </p>
          <div className="flex items-center justify-end gap-1">
            <p className="text-[11px] text-wc-muted ml-2">تبدأ المباراة خلال</p>
            <span className="text-wc-text font-mono font-bold text-xl">
              {String(countdown.h).padStart(2, "0")}:{String(countdown.m).padStart(2, "0")}:{String(countdown.s).padStart(2, "0")}
            </span>
          </div>
        </div>
      )}

      {/* Live "Watch on TOD" strip */}
      {phase === "live" && (
        <div className="px-4 pb-4">
          <button className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 bg-wc-danger">
            شاهد على TOD
          </button>
        </div>
      )}

      {/* ── Phase Tabs + Engagement Layer ─────────────────────────────────── */}
      <PhaseIndicator activePhase={phase} onPhaseChange={setPhase} />

      {phase === "pre" && <PreGame todActivated={todActivated} onActivateTod={() => setTodActivated(true)} />}
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
