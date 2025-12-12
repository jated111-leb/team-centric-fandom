import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import type { AnalyticsData } from "@/pages/Analytics";

interface ExecutiveKPIsProps {
  data: AnalyticsData;
}

export function ExecutiveKPIs({ data }: ExecutiveKPIsProps) {
  const { notifications, userStats, deliveryStats } = data;

  // Calculate week-over-week metrics
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const thisWeekNotifications = notifications.filter(n => new Date(n.sent_at) >= oneWeekAgo).length;
  const lastWeekNotifications = notifications.filter(n => {
    const date = new Date(n.sent_at);
    return date >= twoWeeksAgo && date < oneWeekAgo;
  }).length;

  const weekOverWeekChange = lastWeekNotifications > 0 
    ? ((thisWeekNotifications - lastWeekNotifications) / lastWeekNotifications * 100)
    : 0;

  // Calculate today's active users
  const today = new Date().toDateString();
  const todayUsers = new Set(
    notifications
      .filter(n => new Date(n.sent_at).toDateString() === today)
      .map(n => n.external_user_id)
  ).size;

  // Data quality score (weighted average)
  const dataQualityScore = (
    deliveryStats.correlationRate * 0.5 +
    (userStats.duplicateNotifications === 0 ? 100 : Math.max(0, 100 - userStats.duplicateNotifications * 10)) * 0.3 +
    (deliveryStats.avgWebhookLatency < 300 ? 100 : Math.max(0, 100 - deliveryStats.avgWebhookLatency / 10)) * 0.2
  );

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Daily Active Users</CardTitle>
          <Users className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{todayUsers}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Users reached today
          </p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Week-over-Week</CardTitle>
          {weekOverWeekChange >= 0 ? (
            <ArrowUp className="h-4 w-4 text-secondary" />
          ) : (
            <ArrowDown className="h-4 w-4 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">
              {weekOverWeekChange >= 0 ? '+' : ''}{weekOverWeekChange.toFixed(1)}%
            </span>
            <Badge variant={weekOverWeekChange >= 0 ? "default" : "destructive"}>
              {thisWeekNotifications} this week
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            vs {lastWeekNotifications} last week
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Correlation Rate</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">{deliveryStats.correlationRate.toFixed(1)}%</span>
            {deliveryStats.correlationRate < 70 && (
              <Badge variant="destructive">Low</Badge>
            )}
            {deliveryStats.correlationRate >= 70 && deliveryStats.correlationRate < 90 && (
              <Badge variant="secondary">Good</Badge>
            )}
            {deliveryStats.correlationRate >= 90 && (
              <Badge variant="default">Excellent</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {deliveryStats.naRate.toFixed(1)}% N/A rate
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Data Quality Score</CardTitle>
          {dataQualityScore >= 80 ? (
            <TrendingUp className="h-4 w-4 text-secondary" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">{dataQualityScore.toFixed(0)}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {userStats.duplicateNotifications} duplicates detected
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
