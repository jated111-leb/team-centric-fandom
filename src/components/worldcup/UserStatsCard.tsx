import { getTotalPoints, getQuizAccuracy } from "@/lib/pointsStore";

interface UserStatsCardProps {
  /** Pass a changing value (e.g. points total) to force re-render after quiz/points changes */
  refreshKey?: number;
}

const UserStatsCard = ({ refreshKey = 0 }: UserStatsCardProps) => {
  const totalPoints = getTotalPoints();
  const accuracy = getQuizAccuracy();

  const stats = [
    { label: "مجموع النقاط", value: totalPoints.toLocaleString("ar-EG"), icon: "🏆" },
    { label: "دقة الأجوبة", value: accuracy > 0 ? `${accuracy}%` : "—", icon: "🎯" },
  ];

  return (
    <div className="rounded-2xl p-4 bg-wc-surface border border-wc-border">
      <h3 className="text-wc-text font-bold text-sm mb-3">كيف كان أداؤك؟</h3>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => (
          <div key={i} className="rounded-xl p-3 text-center bg-wc-elevated border border-wc-border">
            <span className="text-lg">{stat.icon}</span>
            <p className="text-wc-text font-bold text-lg mt-1">{stat.value}</p>
            <p className="text-xs text-wc-muted mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserStatsCard;
