import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWcAnalytics } from '@/hooks/wc/useWorldCup';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Loader2, AlertTriangle, Send, Users, Target, ShieldCheck } from 'lucide-react';

const RANGES = [
  { v: '1', l: 'Last 24h' }, { v: '7', l: 'Last 7 days' },
  { v: '14', l: 'Last 14 days' }, { v: '30', l: 'Last 30 days' },
];

export default function WcAnalytics() {
  const [days, setDays] = useState('7');
  const { data, isLoading } = useWcAnalytics(Number(days));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">World Cup Analytics</h1>
          <p className="text-muted-foreground text-sm">KPIs for the WC reminder engine</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Kpi icon={<Send />} label="Scheduled" value={data.scheduled} />
            <Kpi icon={<Target />} label="Delivered" value={data.delivered} />
            <Kpi icon={<Users />} label="Unique users" value={data.uniqueUsers} />
            <Kpi icon={<ShieldCheck />} label="Holdout (est.)" value="—" />
            <Kpi icon={<AlertTriangle />} label="Gap alerts" value={data.gapAlerts} warn />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Per-team breakdown" desc="Scheduled sends by target team">
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

          <ChartCard title="Time-of-day distribution (UTC)" desc="When notifications are delivered">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
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
