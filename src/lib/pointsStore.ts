// Points system — localStorage-backed with Supabase sync.
// localStorage is the source of truth for instant/offline use.
// Call syncPointsToDb() after awarding points when a user is logged in.
// Call loadPointsFromDb() on session start to hydrate from the DB.
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "wc1001_player";

export interface PointsEntry {
  amount: number;
  source: string;
  matchId: string;
  timestamp: number;
}

export interface PlayerData {
  username: string | null;
  totalPoints: number;
  history: PointsEntry[];
  prediction: string | null; // "A" | "draw" | "B"
  quizCorrect: number;
  quizTotal: number;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  points: number;
  isCurrentUser: boolean;
}

// Seeded rival players — static backdrop for the leaderboard
const RIVAL_PLAYERS = [
  { username: "أسد الرافدين", points: 2450 },
  { username: "ابن بغداد", points: 2380 },
  { username: "نمر الرافدين", points: 2210 },
  { username: "عاشق الكرة", points: 2150 },
  { username: "مشجع أسود", points: 1980 },
  { username: "صقر العراق", points: 1870 },
  { username: "ملك المدرجات", points: 1790 },
  { username: "فارس بغداد", points: 1650 },
  { username: "نجم الملاعب", points: 1580 },
];

function load(): PlayerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PlayerData;
  } catch {}
  return {
    username: null,
    totalPoints: 0,
    history: [],
    prediction: null,
    quizCorrect: 0,
    quizTotal: 0,
  };
}

function save(data: PlayerData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getPlayerData(): PlayerData {
  return load();
}

export function getTotalPoints(): number {
  return load().totalPoints;
}

export function getLeaderboard(): LeaderboardEntry[] {
  const data = load();
  const username = data.username || "أنت";

  const all = [
    ...RIVAL_PLAYERS.map((r) => ({
      username: r.username,
      points: r.points,
      isCurrentUser: false,
    })),
    { username, points: data.totalPoints, isCurrentUser: true },
  ].sort((a, b) => b.points - a.points);

  return all.map((entry, i) => ({ ...entry, rank: i + 1 }));
}

export function getUserRank(): number {
  const board = getLeaderboard();
  return board.find((e) => e.isCurrentUser)?.rank ?? board.length;
}

export function getQuizAccuracy(): number {
  const data = load();
  if (data.quizTotal === 0) return 0;
  return Math.round((data.quizCorrect / data.quizTotal) * 100);
}

// ── Writes ────────────────────────────────────────────────────────────────────

export function setUsername(username: string): void {
  const data = load();
  data.username = username;
  save(data);
}

export function addPoints(
  amount: number,
  source: string,
  matchId = "wc-iraq-germany-2026"
): number {
  const data = load();
  data.totalPoints += amount;
  data.history.push({ amount, source, matchId, timestamp: Date.now() });
  save(data);
  return data.totalPoints;
}

export function recordQuizAnswer(correct: boolean): void {
  const data = load();
  data.quizTotal += 1;
  if (correct) data.quizCorrect += 1;
  save(data);
}

export function savePrediction(prediction: string): void {
  const data = load();
  if (!data.prediction) {
    // Only save first prediction; don't allow changing after set
    data.prediction = prediction;
    save(data);
  }
}

export function getPrediction(): string | null {
  return load().prediction;
}

// Prototype result: Iraq wins ("A"). Award points if prediction was correct.
export function awardPredictionPoints(): { awarded: boolean; points: number } {
  const data = load();
  const correctResult = "A";
  const alreadyAwarded = data.history.some((h) => h.source === "prediction");
  if (alreadyAwarded || !data.prediction) return { awarded: false, points: 0 };
  const correct = data.prediction === correctResult;
  if (!correct) return { awarded: false, points: 0 };
  const pts = 50;
  addPoints(pts, "prediction");
  return { awarded: true, points: pts };
}

export function resetPoints(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Supabase sync helpers ──────────────────────────────────────────────────
// These are no-ops if the user is not authenticated; they never throw.

/**
 * Push the current localStorage state to Supabase.
 * - Upserts user_points with the current total.
 * - Inserts any points_history entries newer than the last synced timestamp.
 * Call this after addPoints() when a session is active.
 */
export async function syncPointsToDb(userId: string): Promise<void> {
  const data = load();

  // Upsert total points
  await (supabase as any)
    .from("user_points")
    .upsert(
      { user_id: userId, total_points: data.totalPoints, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  // Insert each history entry (duplicates ignored via unique constraint on user_id+timestamp+source)
  if (data.history.length > 0) {
    await (supabase as any).from("points_history").upsert(
      data.history.map((h) => ({
        user_id: userId,
        amount: h.amount,
        source: h.source,
        match_id: h.matchId,
        created_at: new Date(h.timestamp).toISOString(),
      })),
      { ignoreDuplicates: true }
    );
  }
}

/**
 * Fetch the user's points from Supabase and hydrate localStorage.
 * Call this on app start when a session is detected.
 */
export async function loadPointsFromDb(userId: string, username: string): Promise<void> {
  const { data: pts } = await supabase
    .from("user_points")
    .select("total_points")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: history } = await supabase
    .from("points_history")
    .select("amount, source, match_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const current = load();
  const merged: PlayerData = {
    username: username || current.username,
    totalPoints: pts?.total_points ?? current.totalPoints,
    history: (history ?? []).map((h) => ({
      amount: h.amount,
      source: h.source,
      matchId: h.match_id ?? "",
      timestamp: new Date(h.created_at).getTime(),
    })),
    prediction: current.prediction,
    quizCorrect: current.quizCorrect,
    quizTotal: current.quizTotal,
  };
  save(merged);
}
