import type { WcAnalyticsBundle } from '@/hooks/wc/useWorldCup';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Download, Send, Users, MailOpen, MousePointerClick, AlertTriangle } from 'lucide-react';
import { ChartCard, EmptyState, Kpi, GREEN_RAMP, CATEGORY_COLORS, STAGE_LABELS, downloadCsv } from './shared';

export function WcPreGameSection({ data }: { data: WcAnalyticsBundle }) {
  const pg = data.preGame;
  const openRate = pg.sent > 0 ? ((pg.directOpens / pg.sent) * 100).toFixed(1) : '0';
  const clickRate = pg.sent > 0 ? ((pg.bodyClicks / pg.sent) * 100).toFixed(1) : '0';
  const bounceRate = pg.sent > 0 ? ((pg.bounces / pg.sent) * 100).toFixed(1) : '0';

  const teamData = pg.perTeam.map((t) => ({ ...t, name: t.team }));
  const stageData = pg.perStage.map((s) => ({ name: STAGE_LABELS[s.stage] || s.stage, total: s.total }));
  const hourlyData = pg.hourly.map((h) => ({ ...h, hour: `${String(h.hour).padStart(2, '0')}:00` }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={<Send />} label="Scheduled" value={pg.scheduled} sub="Ledger rows" />
        <Kpi icon={<Send />} label="Sent" value={pg.sent.toLocaleString()} sub={`${pg.entries.toLocaleString()} entries`} />
        <Kpi icon={<Users />} label="Unique reach" value={pg.uniqueRecipients.toLocaleString()} />
        <Kpi icon={<MailOpen />} label="Open rate" value={`${openRate}%`} sub={`${pg.directOpens.toLocaleString()} opens`} />
        <Kpi icon={<MousePointerClick />} label="Click rate" value={`${clickRate}%`} sub={`${pg.bodyClicks.toLocaleString()} clicks`} />
        <Kpi icon={<AlertTriangle />} label="Bounce rate" value={`${bounceRate}%`} tone={pg.bounces > 0 ? 'warn' : 'default'} />
      </div>

      <ChartCard title="Pre-game delivery over time" desc="Sent, reach, opens and clicks per period">
        {pg.daily.length === 0 ? <EmptyState message="No Canvas delivery data in this range." /> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={pg.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend />
              <Line type="monotone" dataKey="sent" name="Sent" stroke={GREEN_RAMP[0]} strokeWidth={2} />
              <Line type="monotone" dataKey="uniqueRecipients" name="Unique reach" stroke="#3B82F6" strokeWidth={2} />
              <Line type="monotone" dataKey="opens" name="Opens" stroke="#F59E0B" strokeWidth={2} />
              <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#A855F7" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Per-team breakdown"
          desc="Scheduled sends per target team (stacked by ledger status)"
          action={
            <Button variant="outline" size="sm" onClick={() => downloadCsv('wc-pregame-per-team.csv', pg.perTeam)} disabled={pg.perTeam.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          }
        >
          {teamData.length === 0 ? <EmptyState message="No scheduled sends in range." /> : (
            <ResponsiveContainer width="100%" height={Math.max(260, teamData.length * 36)}>
              <BarChart data={teamData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={130} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend />
                <Bar dataKey="delivered" name="Delivered" stackId="s" fill={GREEN_RAMP[0]} />
                <Bar dataKey="sent" name="Sent" stackId="s" fill={GREEN_RAMP[2]} />
                <Bar dataKey="queued" name="Queued" stackId="s" fill={GREEN_RAMP[6]}>
                  <LabelList dataKey="total" position="right" fill="hsl(var(--foreground))" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Per-stage breakdown"
          desc="Scheduled sends by tournament stage"
          action={
            <Button variant="outline" size="sm" onClick={() => downloadCsv('wc-pregame-per-stage.csv', pg.perStage)} disabled={pg.perStage.length === 0}>
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
          }
        >
          {stageData.length === 0 ? <EmptyState message="No matches with sends across stages yet." /> : (
            <ResponsiveContainer width="100%" height={Math.max(260, stageData.length * 40)}>
              <BarChart data={stageData} layout="vertical" margin={{ left: 20, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={130} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="total" name="Sends">
                  {stageData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  <LabelList dataKey="total" position="right" fill="hsl(var(--foreground))" fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Send-hour distribution (UTC)" desc="Sanity check that sends fire on the T-60 schedule">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Bar dataKey="count" name="Sends" fill={GREEN_RAMP[0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
