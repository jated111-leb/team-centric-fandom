import { useState, useEffect } from "react";
import { ArrowRight, Cast, Share2, Heart, Bell, Play } from "lucide-react";
import PhaseIndicator from "@/components/worldcup/PhaseIndicator";
import LaLigaPreGame from "./LaLigaPreGame";
import LaLigaInGame from "./LaLigaInGame";
import LaLigaPostGame from "./LaLigaPostGame";
import type { MatchData } from "@/pages/LaLiga";

type Phase = "pre" | "live" | "post";

interface LaLigaMatchHubProps {
  match: MatchData;
  userId?: string | null;
  username?: string | null;
}

function derivePhase(status: string): Phase {
  if (["IN_PLAY", "PAUSED", "HALFTIME"].includes(status)) return "live";
  if (["FINISHED", "AWARDED", "CANCELLED"].includes(status)) return "post";
  return "pre";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

const LaLigaMatchHub = ({ match, userId, username }: LaLigaMatchHubProps) => {
  const autoPhase = derivePhase(match.status);
  const [phase, setPhase] = useState<Phase>(autoPhase);
  const [liked, setLiked] = useState(false);

  // Countdown for pre-game
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    setPhase(derivePhase(match.status));
  }, [match.id, match.status]);

  useEffect(() => {
    if (phase !== "pre") return;

    const updateCountdown = () => {
      const diff = Math.max(0, new Date(match.utc_date).getTime() - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown({ h, m, s });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [phase, match.utc_date]);

  const matchDate = new Date(match.utc_date);
  const formattedDate = matchDate.toLocaleDateString("ar-IQ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = matchDate.toLocaleTimeString("ar-IQ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Baghdad",
  });

  return (
    <div className="flex-1 overflow-y-auto bg-wc-bg">
      {/* Phase Tabs */}
      <PhaseIndicator activePhase={phase} onPhaseChange={setPhase} />

      {/* Hero */}
      <div className="relative w-full" style={{ height: 300 }}>
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(175deg, #1a0a2e 0%, #0a0f1a 55%, #080d10 100%)",
          }}
        />

        {/* Team colour glows */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 55% 70% at 15% 80%, rgba(100,50,150,0.25) 0%, transparent 70%), " +
              "radial-gradient(ellipse 55% 70% at 85% 80%, rgba(200,170,50,0.15) 0%, transparent 70%)",
          }}
        />

        {/* Home team initial badge */}
        <div
          className="absolute select-none flex items-center justify-center rounded-full border-2 border-white/20"
          style={{
            left: "8%",
            bottom: "80px",
            width: 90,
            height: 90,
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}
        >
          <span className="text-white font-bold text-2xl">{getInitials(match.home_team)}</span>
        </div>

        {/* Away team initial badge */}
        <div
          className="absolute select-none flex items-center justify-center rounded-full border-2 border-white/20"
          style={{
            right: "8%",
            bottom: "80px",
            width: 90,
            height: 90,
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(12px)",
          }}
        >
          <span className="text-white font-bold text-2xl">{getInitials(match.away_team)}</span>
        </div>

        {/* VS / Score */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 100 }}>
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
              <span className="text-white font-bold text-4xl font-mono drop-shadow-lg">
                {match.score_home ?? 0}
              </span>
              <span className="text-white/50 text-2xl">-</span>
              <span className="text-white font-bold text-4xl font-mono drop-shadow-lg">
                {match.score_away ?? 0}
              </span>
            </div>
          )}
        </div>

        {/* Live badge */}
        {phase === "live" && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ bottom: 60, background: "rgba(220,40,40,0.9)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] text-white font-bold">مباشر</span>
          </div>
        )}

        {/* Gradient overlay */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: 130,
            background: "linear-gradient(to top, rgba(8,8,12,1) 0%, rgba(8,8,12,0.85) 50%, transparent 100%)",
          }}
        />

        {/* Title */}
        <div className="absolute bottom-0 left-0 right-0 px-5 pb-4 z-10 text-right">
          <h1 className="text-white font-bold leading-tight" style={{ fontSize: 26 }}>
            {match.home_team_arabic} - {match.away_team_arabic}
          </h1>
          {phase === "post" && (
            <span className="text-xs text-white/50 mt-1 inline-block">نهاية المباراة</span>
          )}
        </div>

        {/* Nav */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-20">
          <div />
          <Cast size={20} className="text-white/80 drop-shadow-lg" />
        </div>
      </div>

      {/* Action Row */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <button className="flex items-center justify-center rounded-xl bg-wc-surface border border-wc-border shrink-0" style={{ width: 46, height: 46 }}>
          <Share2 size={17} className="text-wc-text" />
        </button>

        <button
          onClick={() => setLiked((v) => !v)}
          className={`flex items-center justify-center rounded-xl border shrink-0 transition-colors ${
            liked ? "bg-rose-500 border-rose-500" : "bg-wc-surface border-wc-border"
          }`}
          style={{ width: 46, height: 46 }}
        >
          <Heart size={17} className={liked ? "text-white fill-white" : "text-wc-text"} />
        </button>

        {phase === "pre" && (
          <button
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-white"
            style={{ height: 46, background: "#22c55e" }}
          >
            <Bell size={15} className="fill-white text-white" />
            <span>ذكّرني</span>
          </button>
        )}

        {phase === "live" && (
          <button
            className="flex-1 flex items-center justify-center gap-2 rounded-xl font-bold text-sm text-wc-accent-foreground bg-wc-accent"
            style={{ height: 46 }}
          >
            <Play size={15} className="fill-current" />
            <span>شاهد على فدشي</span>
          </button>
        )}

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

      {/* Tag pills */}
      <div className="flex items-center gap-2 px-4 pb-1 flex-row-reverse">
        {["الدوري الإسباني", "تعليق عربي", match.matchday ? `الجولة ${match.matchday}` : "2024/25"].map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-full text-[11px] text-wc-muted bg-wc-elevated border border-wc-border whitespace-nowrap"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Date + countdown (pre) */}
      {phase === "pre" && (
        <div className="px-4 pt-4 pb-2 text-right">
          <p className="text-xs text-wc-muted font-medium">
            {formattedDate} · {formattedTime} بتوقيت بغداد
          </p>

          <div className="mt-4 mb-1">
            <p className="text-[11px] text-wc-muted mb-2 text-center">تبدأ الإثارة خلال</p>
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

      <div className="h-px mx-4 my-3 bg-wc-border" />

      {/* Phase content */}
      {phase === "pre" && (
        <LaLigaPreGame
          match={match}
          userId={userId ?? null}
          username={username ?? null}
        />
      )}
      {phase === "live" && (
        <LaLigaInGame
          match={match}
          userId={userId ?? null}
          username={username ?? null}
        />
      )}
      {phase === "post" && (
        <LaLigaPostGame match={match} />
      )}
    </div>
  );
};

export default LaLigaMatchHub;
