import { Trophy } from "lucide-react";
import { getLeaderboard, getTotalPoints, getUserRank, type LeaderboardEntry } from "@/lib/pointsStore";

interface MiniLeaderboardProps {
  refreshKey?: number; // bump to force re-render
}

const MiniLeaderboard = ({ refreshKey = 0 }: MiniLeaderboardProps) => {
  const leaderboard = getLeaderboard();
  const userIdx = leaderboard.findIndex((e) => e.isCurrentUser);
  const totalPoints = getTotalPoints();
  const userRank = getUserRank();

  // Show 2 above + user + 2 below (clamped to bounds)
  const startIdx = Math.max(0, userIdx - 2);
  const endIdx = Math.min(leaderboard.length, userIdx + 3);
  const visible = leaderboard.slice(startIdx, endIdx);

  // If user isn't in visible slice (edge case), ensure they are
  if (!visible.find((e) => e.isCurrentUser) && leaderboard[userIdx]) {
    visible.push(leaderboard[userIdx]);
  }

  const medalEmoji = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-wc-surface border border-wc-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-wc-border">
        <div className="flex items-center gap-2">
          <Trophy size={14} className="text-wc-warning" />
          <span className="text-wc-text text-sm font-bold">ترتيبك</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-wc-accent">#{userRank}</span>
          <span className="text-[10px] text-wc-muted">·</span>
          <span className="text-xs font-mono text-wc-warning">{totalPoints.toLocaleString("ar-EG")} نقطة</span>
        </div>
      </div>

      {/* Rows */}
      <div className="px-3 py-2 space-y-0.5">
        {/* Ellipsis above if not starting from top */}
        {startIdx > 0 && (
          <div className="text-center py-0.5">
            <span className="text-[10px] text-wc-muted">⋮</span>
          </div>
        )}

        {visible.map((user) => (
          <div
            key={user.rank}
            className={`flex items-center gap-2.5 py-2 px-2.5 rounded-xl transition-all ${
              user.isCurrentUser
                ? "bg-wc-accent/15 border border-wc-accent/30"
                : ""
            }`}
          >
            {/* Rank */}
            <span
              className={`text-xs font-bold w-5 text-center ${
                user.rank <= 3 ? "text-wc-warning" : "text-wc-muted"
              }`}
            >
              {medalEmoji(user.rank) ?? user.rank}
            </span>

            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                user.isCurrentUser
                  ? "bg-wc-accent text-wc-accent-foreground"
                  : "bg-wc-elevated text-wc-text"
              }`}
            >
              {user.username[0]}
            </div>

            {/* Name */}
            <span
              className={`flex-1 text-xs ${
                user.isCurrentUser ? "text-wc-text font-bold" : "text-wc-text"
              }`}
            >
              {user.username}
              {user.isCurrentUser && (
                <span className="text-wc-accent text-[9px] mr-1">(أنت)</span>
              )}
            </span>

            {/* Points */}
            <span
              className={`text-xs font-mono ${
                user.isCurrentUser ? "text-wc-accent font-bold" : "text-wc-muted"
              }`}
            >
              {user.points.toLocaleString("ar-EG")}
            </span>
          </div>
        ))}

        {/* Ellipsis below if not ending at bottom */}
        {endIdx < leaderboard.length && (
          <div className="text-center py-0.5">
            <span className="text-[10px] text-wc-muted">⋮</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniLeaderboard;
