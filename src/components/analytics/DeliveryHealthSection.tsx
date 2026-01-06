import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle, CheckCircle, Timer, Activity } from "lucide-react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import type { AnalyticsData } from "@/pages/Analytics";

interface DeliveryHealthSectionProps {
  data: AnalyticsData;
}

export function DeliveryHealthSection({ data }: DeliveryHealthSectionProps) {
  const { deliveryStats } = data;

  // Calculate hourly trends
  const hourlyData = deliveryStats.hourlyDistribution.map(h => ({
    ...h,
    label: `${h.hour.toString().padStart(2, '0')}:00`,
  }));

  // Find peak hours
  const sortedHours = [...deliveryStats.hourlyDistribution].sort((a, b) => b.count - a.count);
  const peakHour = sortedHours[0] || { hour: 0, count: 0 };
  
  // Calculate peak percentage from total sent
  const totalFromHourly = deliveryStats.hourlyDistribution.reduce((sum, h) => sum + h.count, 0);
  const peakPercentage = totalFromHourly > 0 
    ? (peakHour.count / totalFromHourly) * 100 
    : 0;

  const getHealthStatus = () => {
    if (deliveryStats.correlationRate >= 90 && deliveryStats.avgWebhookLatency < 180) {
      return { status: 'excellent', color: 'text-secondary', icon: CheckCircle };
    }
    if (deliveryStats.correlationRate >= 70 && deliveryStats.avgWebhookLatency < 300) {
      return { status: 'good', color: 'text-primary', icon: CheckCircle };
    }
    return { status: 'needs attention', color: 'text-destructive', icon: AlertTriangle };
  };

  const health = getHealthStatus();
  const HealthIcon = health.icon;

  return (
    <div className="space-y-6">
      {/* Health Status Alert */}
      <Alert className={health.status === 'excellent' ? 'border-secondary/50 bg-secondary/5' : health.status === 'good' ? 'border-primary/50 bg-primary/5' : ''}>
        <HealthIcon className={`h-4 w-4 ${health.color}`} />
        <AlertTitle className="capitalize">System Health: {health.status}</AlertTitle>
        <AlertDescription>
          {health.status === 'excellent' && 'All systems operating optimally. Correlation rate and webhook latency are within ideal ranges.'}
          {health.status === 'good' && 'Systems are healthy. Minor improvements could be made to correlation or latency.'}
          {health.status === 'needs attention' && 'Some metrics are below optimal thresholds. Review correlation rate and webhook configuration.'}
        </AlertDescription>
      </Alert>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Correlation Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deliveryStats.correlationRate.toFixed(1)}%</div>
            <Progress value={deliveryStats.correlationRate} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              N/A Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{deliveryStats.naRate.toFixed(1)}%</span>
              {deliveryStats.naRate > 30 && (
                <Badge variant="destructive">High</Badge>
              )}
              {deliveryStats.naRate <= 30 && deliveryStats.naRate > 10 && (
                <Badge variant="secondary">Moderate</Badge>
              )}
              {deliveryStats.naRate <= 10 && (
                <Badge variant="default" className="bg-secondary">Low</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Avg Webhook Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {deliveryStats.avgWebhookLatency < 60 
                ? `${deliveryStats.avgWebhookLatency.toFixed(0)}s`
                : `${(deliveryStats.avgWebhookLatency / 60).toFixed(1)}m`
              }
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Time from send to webhook
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Peak Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{peakHour.hour.toString().padStart(2, '0')}:00 UTC</div>
            <p className="text-xs text-muted-foreground mt-1">
              {peakPercentage.toFixed(0)}% of all notifications
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Hourly Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Hourly Send Distribution
          </CardTitle>
          <CardDescription>When notifications are being sent (UTC)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" interval={2} />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Notifications']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {hourlyData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.hour === peakHour.hour ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                      opacity={entry.hour === peakHour.hour ? 1 : 0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* N/A Rate Info */}
      <Card>
        <CardHeader>
          <CardTitle>Data Quality Summary</CardTitle>
          <CardDescription>Correlation status for match notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Correlated Notifications</p>
              <p className="text-2xl font-bold mt-1 text-secondary">
                {deliveryStats.correlationRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Notifications with complete match data
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Missing Data (N/A)</p>
              <p className="text-2xl font-bold mt-1 text-destructive">
                {deliveryStats.naRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Notifications missing team or match info
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latency Distribution Info */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Latency Details</CardTitle>
          <CardDescription>Time between notification send and webhook receipt</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Average Latency</p>
              <p className="text-2xl font-bold mt-1">
                {deliveryStats.avgWebhookLatency < 60 
                  ? `${deliveryStats.avgWebhookLatency.toFixed(0)} seconds`
                  : `${(deliveryStats.avgWebhookLatency / 60).toFixed(1)} minutes`
                }
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Correlation Window</p>
              <p className="text-2xl font-bold mt-1">±10 minutes</p>
              <p className="text-xs text-muted-foreground mt-1">
                Webhooks within this window correlate with match data
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Recommendation</p>
              <p className="text-sm mt-1">
                {deliveryStats.avgWebhookLatency < 180 
                  ? 'Latency is within acceptable range. No action needed.'
                  : deliveryStats.avgWebhookLatency < 300
                    ? 'Latency is moderate. Monitor for increases.'
                    : 'High latency detected. Consider reviewing Braze webhook configuration.'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
