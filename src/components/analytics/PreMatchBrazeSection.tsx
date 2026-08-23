import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Send, Users, Eye, MousePointerClick } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO } from "date-fns";

interface Row {
  date: string;
  sent: number;
  unique_recipients: number;
  direct_opens: number;
  total_opens: number;
  body_clicks: number;
  bounces: number;
  synced_at: string;
}

export const PreMatchBrazeSection = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_analytics")
      .select("date, sent, unique_recipients, direct_opens, total_opens, body_clicks, bounces, synced_at")
      .eq("notification_type", "pre_match")
      .order("date", { ascending: true });

    if (error) console.error("Error loading pre-match analytics:", error);
    setRows((data || []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const { error } = await supabase.functions.invoke("sync-campaign-analytics", { method: "GET" });
    setSyncing(false);
    if (error) {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Sync complete", description: "Match reminder stats refreshed from Braze." });
    fetchData();
  };

  const totals = rows.reduce(
    (a, r) => ({
      sent: a.sent + r.sent,
      recipients: a.recipients + r.unique_recipients,
      opens: a.opens + r.direct_opens,
      clicks: a.clicks + r.body_clicks,
    }),
    { sent: 0, recipients: 0, opens: 0, clicks: 0 }
  );

  const openRate = totals.sent > 0 ? ((totals.opens / totals.sent) * 100).toFixed(1) : "0";
  const lastSynced = rows.length ? rows.reduce((a, b) => (a.synced_at > b.synced_at ? a : b)).synced_at : null;

  const chartData = rows
    .filter((r) => r.sent > 0 || r.unique_recipients > 0)
    .map((r) => ({
      date: format(parseISO(r.date), "MMM dd"),
      reach: r.unique_recipients,
      sent: r.sent,
      opens: r.direct_opens,
    }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Match Reminder Delivery (Braze)</CardTitle>
          <CardDescription>
            Pulled from the Braze Canvas data series
            {lastSynced ? ` · last synced ${format(parseISO(lastSynced), "MMM dd, HH:mm")}` : ""}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          Sync
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> Reach
            </div>
            <p className="text-2xl font-bold mt-1">{totals.recipients.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Send className="h-4 w-4" /> Sent
            </div>
            <p className="text-2xl font-bold mt-1">{totals.sent.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" /> Opens
            </div>
            <p className="text-2xl font-bold mt-1">{totals.opens.toLocaleString()}</p>
            <Badge variant="secondary" className="mt-1">{openRate}% open rate</Badge>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MousePointerClick className="h-4 w-4" /> Clicks
            </div>
            <p className="text-2xl font-bold mt-1">{totals.clicks.toLocaleString()}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Braze data yet. Stats appear a few hours after a send.
          </p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                  }}
                />
                <Legend />
                <Bar dataKey="reach" name="Reach" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="sent" name="Sent" fill="hsl(var(--muted-foreground))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="opens" name="Opens" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
