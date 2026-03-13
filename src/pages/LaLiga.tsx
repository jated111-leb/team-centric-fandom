import { useState, useEffect } from "react";
import StatusBar from "@/components/worldcup/StatusBar";
import BottomTabBar from "@/components/worldcup/BottomTabBar";
import LaLigaMatchHub from "@/components/laliga/LaLigaMatchHub";
import { supabase } from "@/integrations/supabase/client";
import { loadPointsFromDb, setUsername as storeSetUsername } from "@/lib/pointsStore";

export interface MatchData {
  id: number;
  home_team: string;
  away_team: string;
  home_team_arabic: string;
  away_team_arabic: string;
  score_home: number | null;
  score_away: number | null;
  status: string;
  utc_date: string;
  match_date: string;
  competition: string;
  competition_name: string;
  matchday: string | null;
}

// Priority teams for auto-selection
const PRIORITY_TEAMS = ["Real Madrid CF", "FC Barcelona"];

function isPriorityMatch(m: MatchData) {
  return PRIORITY_TEAMS.some(
    (t) => m.home_team.includes(t) || m.away_team.includes(t)
  );
}

function derivePhase(status: string): "pre" | "live" | "post" {
  if (["IN_PLAY", "PAUSED", "HALFTIME"].includes(status)) return "live";
  if (["FINISHED", "AWARDED", "CANCELLED"].includes(status)) return "post";
  return "pre";
}

const LaLiga = () => {
  const [activeTab, setActiveTab] = useState("home");
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id);
        loadProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        loadProfile(session.user.id);
      } else {
        setUserId(null);
        setUsername(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (uid: string) => {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("username, display_name")
      .eq("id", uid)
      .maybeSingle();
    const name = data?.username ?? data?.display_name ?? null;
    if (name) {
      setUsername(name);
      storeSetUsername(name);
    }
    await loadPointsFromDb(uid, name ?? "");
  };

  // Fetch La Liga matches + team translations
  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);

      // Get today in YYYY-MM-DD
      const today = new Date().toISOString().slice(0, 10);

      // Fetch upcoming + today's + recent matches
      const { data: rawMatches } = await supabase
        .from("matches")
        .select("id, home_team, away_team, score_home, score_away, status, utc_date, match_date, competition, competition_name, matchday")
        .eq("competition", "PD")
        .gte("match_date", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
        .order("utc_date", { ascending: true })
        .limit(30);

      if (!rawMatches || rawMatches.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch team translations for Arabic names
      const teamNames = new Set<string>();
      rawMatches.forEach((m) => {
        teamNames.add(m.home_team);
        teamNames.add(m.away_team);
      });

      const { data: translations } = await supabase
        .from("team_translations")
        .select("team_name, arabic_name")
        .in("team_name", Array.from(teamNames));

      const translationMap = new Map<string, string>();
      translations?.forEach((t) => translationMap.set(t.team_name, t.arabic_name));

      const enriched: MatchData[] = rawMatches.map((m) => ({
        ...m,
        home_team_arabic: translationMap.get(m.home_team) ?? m.home_team,
        away_team_arabic: translationMap.get(m.away_team) ?? m.away_team,
      }));

      setMatches(enriched);

      // Auto-select best match
      const live = enriched.filter((m) => derivePhase(m.status) === "live");
      if (live.length > 0) {
        setSelectedMatch(live.find(isPriorityMatch) ?? live[0]);
      } else {
        const upcoming = enriched.filter((m) => derivePhase(m.status) === "pre");
        if (upcoming.length > 0) {
          setSelectedMatch(upcoming.find(isPriorityMatch) ?? upcoming[0]);
        } else {
          // Show latest finished
          const finished = enriched.filter((m) => derivePhase(m.status) === "post");
          setSelectedMatch(finished[finished.length - 1] ?? enriched[0]);
        }
      }

      setLoading(false);
    };

    fetchMatches();
  }, []);

  // Group same-day matches for the picker
  const sameDayMatches = selectedMatch
    ? matches.filter((m) => m.match_date === selectedMatch.match_date)
    : [];

  return (
    <div className="flex justify-center min-h-screen bg-black">
      <div
        className="relative flex flex-col w-full max-w-[390px] min-h-screen overflow-hidden bg-wc-bg font-arabic"
        dir="rtl"
      >
        <StatusBar />

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl mb-3 animate-pulse">⚽</div>
              <p className="text-wc-muted text-sm">جاري تحميل المباريات...</p>
            </div>
          </div>
        ) : !selectedMatch ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-8">
              <div className="text-3xl mb-3">📅</div>
              <p className="text-wc-text font-bold text-sm">لا توجد مباريات قريبة</p>
              <p className="text-wc-muted text-xs mt-1">ترقب مباريات الدوري الإسباني القادمة</p>
            </div>
          </div>
        ) : (
          <>
            {/* Match Picker — only if multiple same-day matches */}
            {sameDayMatches.length > 1 && (
              <div className="flex gap-2 px-3 pt-2 overflow-x-auto scrollbar-hide" style={{ direction: "rtl" }}>
                {sameDayMatches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMatch(m)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all ${
                      selectedMatch.id === m.id
                        ? "bg-wc-accent text-wc-accent-foreground border-wc-accent"
                        : "bg-wc-surface text-wc-muted border-wc-border"
                    }`}
                  >
                    {m.home_team_arabic} × {m.away_team_arabic}
                  </button>
                ))}
              </div>
            )}

            <LaLigaMatchHub
              match={selectedMatch}
              userId={userId}
              username={username}
            />
          </>
        )}

        <BottomTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  );
};

export default LaLiga;
