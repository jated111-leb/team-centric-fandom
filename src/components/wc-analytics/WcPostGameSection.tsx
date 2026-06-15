import type { WcAnalyticsBundle } from '@/hooks/wc/useWorldCup';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Download, Trophy, Users, MailOpen, MousePointerClick, AlertTriangle, Award } from 'lucide-react';
import { ChartCard, EmptyState, Kpi, GREEN_RAMP, CATEGORY_COLORS, downloadCsv } from './shared';

export function WcPostGameSection({ data }: { data: WcAnalyticsBundle }) {
  const cg = data.postGame;
  const openRate = cg.sent > 0 ? ((cg.directOpens / cg.sent) * 100).toFixed(1) : '0';
  const clickRate = cg.sent > 0 ? ((cg.bodyClicks / cg.sent) * 100).toFixed(1) : '0';
  const bounceRate = cg.sent > 0 ? ((cg.bounces / cg.sent) * 100).toFixed(1) : '0';

  const teamData = cg.perTeam.map((t) => ({ name: t.team, count: t.count }));

  // Latency bins
  const bins = [0, 15, 30, 45, 60, 90, 120, 180];
  const latencyData = bins.map((min, i) => {
    const max = bins[i + 1] ?? 999;
    const label = bins[i + 1] ? `${min}-${max}m` : `${min}m+`;
    const count = cg.latencyMinutes.filter((l) => l >= min && l < max).length;
    return { bin: label, count };
  });
  const channelData = cg.channelSplit.map((c) => ({
    ...c,
    name: c.channel.replace('_push', '').replace('android', 'Android').replace('ios', 'iOS'),
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={<Award />} label="Triggered" value={cg.triggered} sub="Winning matches" tone="success" />
        <Kpi icon={<Trophy />} label="Sent" value={cg.sent.toLocaleString()} />
        <Kpi icon={<Users />} label="Unique reach" value={cg.uniqueRecipients.toLocaleString()} />
        <Kpi icon={<MailOpen />} label="Open rate" value={`${openRate}%`} sub={`${cg.directOpens.toLocaleString()} opens`} />
        <Kpi icon={<MousePointerClick />} label="Click rate" value={`${clickRate}%`} sub={`${cg.bodyClicks.toLocaleString()} clicks · ${cg.conversions} conv.`} />
        <Kpi icon={<AlertTriangle />} label="Bounce rate" value={`${bounceRate}%`} tone={cg.bounces > 0 ? 'warn' : 'default'} />
      </div>

      <ChartCard title="Congrats delivery over time" desc="Campaign sends, opens and clicks per period">
        {cg.daily.length === 0 ? <EmptyState message="No congrats sends in this range yet." /> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cg.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend />
              <Line type="monotone" dataKey="sent" name="Sent" stroke={GREEN_RAMP[0]} strokeWidth={2} />
              <Line type="monotone" dataKey="uniqueRecipients" name="Unique reach" stroke="#3B82F6" strokeWidth={2} />
              <Line type="monotone" dataKey="opens" name="Opens" stroke="#F59E0B" strokeWidth={2} />
              <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#A855F7" strokeWidth={2} />
              <Line type="monotone" dataKey="conversions" name="Conversions" stroke="#EC4899" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Per winning-team"
          desc="Congrats triggered count by winning team"
          action={
            <Button variant="outline" size="sm" onClick={() => downloadCsv('wc-postgame-per-team.csv', cg.perTeam)} disabled={cg.perTeam.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          }
        >
          {teamData.length === 0 ? <EmptyState message="No winning featured teams in range." /> : (
            <ResponsiveContainer width="100%" height={Math.max(220, teamData.length * 36)}>
              <BarChart data={teamData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={130} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" name="Triggered">
                  {teamData.map((_, i) => <Cell key={i} fill={GREEN_RAMP[i % GREEN_RAMP.length]} />)}
                  <LabelList dataKey="count" position="right" fill="hsl(var(--foreground))" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Channel split" desc="Sends and engagement by push channel">
          {channelData.length === 0 ? <EmptyState message="No channel data yet." /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="sent" name="Sent" fill={GREEN_RAMP[0]} />
                <Bar dataKey="opens" name="Opens" fill="#F59E0B" />
                <Bar dataKey="clicks" name="Clicks" fill="#A855F7" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Send latency after match end"
        desc="Minutes from estimated final whistle (kickoff + 110m) to congrats trigger"
      >
        {cg.latencyMinutes.length === 0 ? <EmptyState message="No latency data yet." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={latencyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bin" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Bar dataKey="count" name="Matches" fill={GREEN_RAMP[1]}>
                <LabelList dataKey="count" position="top" fill="hsl(var(--foreground))" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
