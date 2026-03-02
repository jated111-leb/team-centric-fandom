import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Send, Users, MousePointerClick, Eye, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO } from "date-fns";

interface CampaignAnalyticsRow {
  id: string;
  campaign_id: string;
  date: string;
  sent: number;
  unique_recipients: number;
  direct_opens: number;
  total_opens: number;
  bounces: number;
  body_clicks: number;
  conversions: number;
  synced_at: string;
}

export const CongratsAnalyticsSection = () => {
  const { toast } = useToast();
  const [data, setData] = useState<CampaignAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from("campaign_analytics")
        .select("*")
        .eq("notification_type", "congrats")
        .order("date", { ascending: true });

      if (error) throw error;

      const typedRows = (rows || []) as unknown as CampaignAnalyticsRow[];
      setData(typedRows);

      if (typedRows.length > 0) {
        const latest = typedRows.reduce((a, b) =>
          new Date(a.synced_at) > new Date(b.synced_at) ? a : b
        );
        setLastSynced(latest.synced_at);
      }
    } catch (error: any) {
      console.error("Error fetching campaign analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const { data: result, error } = await supabase.functions.invoke("sync-campaign-analytics", {
        method: "GET",
      });

      if (error) throw error;

      toast({
        title: "Sync Complete",
        description: `Synced ${result?.days_fetched || 0} days, ${result?.rows_upserted || 0} rows upserted.`,
      });

      await fetchData();
    } catch (error: any) {
      console.error("Sync error:", error);
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  // Aggregate KPIs
  const totals = data.reduce(
    (acc, row) => ({
      sent: acc.sent + row.sent,
      uniqueRecipients: acc.uniqueRecipients + row.unique_recipients,
      directOpens: acc.directOpens + row.direct_opens,
      totalOpens: acc.totalOpens + row.total_opens,
      bounces: acc.bounces + row.bounces,
      bodyClicks: acc.bodyClicks + row.body_clicks,
      conversions: acc.conversions + row.conversions,
    }),
    { sent: 0, uniqueRecipients: 0, directOpens: 0, totalOpens: 0, bounces: 0, bodyClicks: 0, conversions: 0 }
  );

  const openRate = totals.sent > 0 ? ((totals.directOpens / totals.sent) * 100).toFixed(1) : "0";
  const clickRate = totals.sent > 0 ? ((totals.bodyClicks / totals.sent) * 100).toFixed(1) : "0";
  const bounceRate = totals.sent > 0 ? ((totals.bounces / totals.sent) * 100).toFixed(1) : "0";

  // Chart data
  const chartData = data
    .filter((row) => row.sent > 0 || row.unique_recipients > 0)
    .map((row) => ({
      date: format(parseISO(row.date), "MMM dd"),
      fullDate: row.date,
      sent: row.sent,
      opens: row.direct_opens,
      clicks: row.body_clicks,
      recipients: row.unique_recipients,
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Congrats Campaign — Braze Delivery Data</h3>
          {lastSynced && (
            <Badge variant="outline" className="text-xs">
              Last synced: {format(new Date(lastSynced), "MMM dd, HH:mm")}
            </Badge>
          )}
        </div>
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from Braze"}
        </Button>
      </div>

      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">
              No campaign data yet. Click "Sync from Braze" to pull delivery stats.
            </p>
            <Button onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> Total Sent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.sent.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Unique Recipients
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.uniqueRecipients.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> Open Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{openRate}%</div>
                <p className="text-xs text-muted-foreground">{totals.directOpens.toLocaleString()} direct opens</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <MousePointerClick className="h-3.5 w-3.5" /> Click Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{clickRate}%</div>
                <p className="text-xs text-muted-foreground">{totals.bodyClicks.toLocaleString()} clicks</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Bounce Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{bounceRate}%</div>
                <p className="text-xs text-muted-foreground">{totals.bounces.toLocaleString()} bounces</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  Conversions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.conversions.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Trend Chart */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Delivery Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="sent"
                      name="Sent"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="opens"
                      name="Direct Opens"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="clicks"
                      name="Clicks"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
