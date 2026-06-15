import type { WcAnalyticsBundle } from '@/hooks/wc/useWorldCup';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ChartCard, EmptyState } from './shared';

export function WcOverviewSection({ data }: { data: WcAnalyticsBundle }) {
  // Merge daily series for two-line comparison
  const buckets = new Set<string>();
  data.preGame.daily.forEach((d) => buckets.add(d.bucket));
  data.postGame.daily.forEach((d) => buckets.add(d.bucket));
  const merged = Array.from(buckets).sort().map((bucket) => ({
    bucket,
    preGame: data.preGame.daily.find((d) => d.bucket === bucket)?.sent || 0,
    postGame: data.postGame.daily.find((d) => d.bucket === bucket)?.sent || 0,
  }));

  const funnel = [
    { stage: 'Scheduled', preGame: data.preGame.scheduled, postGame: data.postGame.triggered },
    { stage: 'Sent', preGame: data.preGame.sent, postGame: data.postGame.sent },
    { stage: 'Unique reach', preGame: data.preGame.uniqueRecipients, postGame: data.postGame.uniqueRecipients },
    { stage: 'Opens', preGame: data.preGame.directOpens, postGame: data.postGame.directOpens },
    { stage: 'Clicks', preGame: data.preGame.bodyClicks, postGame: data.postGame.bodyClicks },
  ];

  return (
    <div className="space-y-6">
      <ChartCard title="Sent over time — Pre-game vs Post-game" desc="Two-line comparison at the selected grain">
        {merged.length === 0 ? <EmptyState message="No delivery data in this range. Try Sync now or widen the range." /> : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
              <Legend />
              <Line type="monotone" dataKey="preGame" name="Pre-game" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="postGame" name="Post-game" stroke="#13CB5C" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Funnel — Pre-game vs Post-game" desc="From schedule to engagement">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={funnel} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis type="category" dataKey="stage" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
            <Legend />
            <Bar dataKey="preGame" name="Pre-game" fill="#3B82F6" />
            <Bar dataKey="postGame" name="Post-game" fill="#13CB5C" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
