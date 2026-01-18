import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import type { AnalyticsData } from "@/pages/Analytics";

interface ContentPerformanceSectionProps {
  data: AnalyticsData;
}

export function ContentPerformanceSection({ data }: ContentPerformanceSectionProps) {
  const { contentStats } = data;

  const pieColors = [
    'hsl(var(--primary))',
    'hsl(var(--secondary))',
    'hsl(var(--accent))',
    'hsl(160, 60%, 35%)',
    'hsl(200, 60%, 45%)',
    'hsl(280, 60%, 45%)',
    'hsl(320, 60%, 45%)',
  ];

  const barColors = 'hsl(var(--primary))';

  // Custom label for pie chart
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Don't show label for small slices
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Prepare match breakdown data for chart
  const matchChartData = contentStats.matchPerformance.slice(0, 10).map(match => ({
    name: `${match.homeTeam.split(' ')[0]} vs ${match.awayTeam.split(' ')[0]}`,
    fullName: `${match.homeTeam} vs ${match.awayTeam}`,
    notifications: match.reach,
    uniqueUsers: match.uniqueUsers,
    competition: match.competition,
    date: match.sentDate,
    matchId: match.matchId
  }));

  // Custom tooltip for match breakdown
  const MatchBreakdownTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-sm mb-1">{data.fullName}</p>
          <p className="text-xs text-muted-foreground mb-2">{data.competition} • {data.date}</p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: 'hsl(var(--primary))' }}></span>
              Notifications: <span className="font-mono font-medium">{data.notifications.toLocaleString()}</span>
            </p>
            <p className="text-sm">
              <span className="inline-block w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: 'hsl(var(--secondary))' }}></span>
              Unique Users: <span className="font-mono font-medium">{data.uniqueUsers.toLocaleString()}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Match Notification Breakdown Chart - NEW */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications by Match</CardTitle>
          <CardDescription>Total notifications and unique users per game</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={matchChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="name" type="category" width={130} className="text-xs" />
                <Tooltip content={<MatchBreakdownTooltip />} />
                <Legend 
                  formatter={(value) => value === 'notifications' ? 'Notifications' : 'Unique Users'}
                />
                <Bar dataKey="notifications" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="notifications" />
                <Bar dataKey="uniqueUsers" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} name="uniqueUsers" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Top Teams Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Top Teams by Reach</CardTitle>
          <CardDescription>Teams that generate the most notification engagement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contentStats.teamBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="team" type="category" width={120} className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Notifications']}
                />
                <Bar dataKey="count" fill={barColors} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Competition Breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Competition Breakdown</CardTitle>
            <CardDescription>Distribution of notifications by competition</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={contentStats.competitionBreakdown}
                    dataKey="count"
                    nameKey="competition"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    labelLine={false}
                    label={renderCustomizedLabel}
                  >
                    {contentStats.competitionBreakdown.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [value.toLocaleString(), 'Notifications']}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Competition Stats</CardTitle>
            <CardDescription>Detailed breakdown by league</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {contentStats.competitionBreakdown.slice(0, 6).map((comp, idx) => {
                const total = contentStats.competitionBreakdown.reduce((sum, c) => sum + c.count, 0);
                const percentage = (comp.count / total) * 100;
                
                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{comp.competition}</span>
                      <span className="text-muted-foreground">
                        {comp.count.toLocaleString()} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Match Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Match Performance</CardTitle>
          <CardDescription>Individual match reach and data correlation rates</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Match</TableHead>
                <TableHead className="text-right">Notifications</TableHead>
                <TableHead className="text-right">Unique Users</TableHead>
                <TableHead className="text-right">Correlation</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contentStats.matchPerformance.map((match) => (
                <TableRow key={match.matchId}>
                  <TableCell>
                    <div className="font-medium">
                      {match.homeTeam} vs {match.awayTeam}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {match.competition} • {match.sentDate}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono">{match.reach.toLocaleString()}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono">{match.uniqueUsers.toLocaleString()}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono">{match.correlationRate.toFixed(1)}%</span>
                  </TableCell>
                  <TableCell>
                    {match.correlationRate >= 90 && (
                      <Badge variant="default" className="bg-secondary">Excellent</Badge>
                    )}
                    {match.correlationRate >= 70 && match.correlationRate < 90 && (
                      <Badge variant="secondary">Good</Badge>
                    )}
                    {match.correlationRate < 70 && (
                      <Badge variant="destructive">Needs Review</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
