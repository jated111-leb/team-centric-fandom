import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useWcAnalytics } from '@/hooks/wc/useWorldCup';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts';
import { Loader2, AlertTriangle, Send, Users, Target, MailOpen, RefreshCw } from 'lucide-react';

const RANGES = [
  { v: '1', l: 'Last 24h' }, { v: '7', l: 'Last 7 days' },
  { v: '14', l: 'Last 14 days' }, { v: '30', l: 'Last 30 days' },
];

export default function WcAnalytics() {
  const [days, setDays] = useState('7');
  const [syncing, setSyncing] = useState(false);
  const { data, isLoading } = useWcAnalytics(Number(days));
  const qc = useQueryClient();

  async function syncNow() {
    setSyncing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('sync-wc-canvas-analytics');
      if (error) throw error;
      toast.success(`Synced ${res?.total_rows ?? 0} daily rows from Braze`);
      qc.invalidateQueries({ queryKey: ['wc_analytics_api'] });
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">World Cup Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Delivery KPIs sourced directly from Braze's data_series API · daily sync
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync now
          </Button>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {data.lastSyncedAt && (
            <p className="text-xs text-muted-foreground">
              Last synced: {new Date(data.lastSyncedAt).toLocaleString()} ·
              {' '}Pre-game sent: <span className="text-foreground font-medium">{data.preGameSent}</span> ·
              {' '}Congrats sent: <span className="text-foreground font-medium">{data.congratsSent}</span>
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Kpi icon={<Send />} label="Scheduled" value={data.scheduled} />
            <Kpi icon={<Target />} label="Delivered (API)" value={data.delivered} />
            <Kpi icon={<Users />} label="Unique recipients" value={data.uniqueUsers} />
            <Kpi icon={<MailOpen />} label="Open rate" value={`${data.openRate}%`} />
            <Kpi icon={<AlertTriangle />} label="Gap alerts" value={data.gapAlerts} warn />
          </div>

          <ChartCard title="Daily delivery (Braze API)" desc="Sent vs opens per day across the WC Canvas + Congrats Campaign">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="opens" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Per-team breakdown" desc="Scheduled sends by target team (from ledger)">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.perTeam}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="team" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Per-stage breakdown" desc="Scheduled sends by tournament stage">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.perStage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number | string; warn?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${warn ? 'text-destructive' : 'text-muted-foreground'}`}>
          <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>{label}
        </div>
        <div className="text-3xl font-bold mt-2">{value}</div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
