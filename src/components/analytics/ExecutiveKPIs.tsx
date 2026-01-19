import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import type { AnalyticsData } from "@/pages/Analytics";

interface ExecutiveKPIsProps {
  data: AnalyticsData;
}

export function ExecutiveKPIs({ data }: ExecutiveKPIsProps) {
  const { userStats, deliveryStats, periodComparison } = data;

  // Calculate period-over-period change
  const periodChange = periodComparison.previousPeriodNotifications > 0 
    ? ((periodComparison.currentPeriodNotifications - periodComparison.previousPeriodNotifications) / periodComparison.previousPeriodNotifications * 100)
    : 0;

  // Data quality score (weighted average)
  const dataQualityScore = (
    deliveryStats.correlationRate * 0.5 +
    (userStats.duplicateNotifications === 0 ? 100 : Math.max(0, 100 - userStats.duplicateNotifications * 10)) * 0.3 +
    (deliveryStats.avgWebhookLatency < 300 ? 100 : Math.max(0, 100 - deliveryStats.avgWebhookLatency / 10)) * 0.2
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5 border-secondary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Period-over-Period</CardTitle>
          {periodChange >= 0 ? (
            <ArrowUp className="h-4 w-4 text-secondary" />
          ) : (
            <ArrowDown className="h-4 w-4 text-destructive" />
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold">
              {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(1)}%
            </span>
            <Badge variant={periodChange >= 0 ? "default" : "destructive"}>
              {periodComparison.currentPeriodNotifications.toLocaleString()} this period
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            vs {periodComparison.previousPeriodNotifications.toLocaleString()} previous period
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
