import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Users, UserCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { AnalyticsData } from "@/pages/Analytics";

interface UserInsightsSectionProps {
  data: AnalyticsData;
}

export function UserInsightsSection({ data }: UserInsightsSectionProps) {
  const { notifications, userStats } = data;

  // Calculate notification frequency distribution
  const userNotificationCounts = new Map<string, number>();
  notifications.forEach(n => {
    const userId = n.external_user_id || 'unknown';
    userNotificationCounts.set(userId, (userNotificationCounts.get(userId) || 0) + 1);
  });

  const frequencyDistribution = [
    { range: '1', count: 0 },
    { range: '2-5', count: 0 },
    { range: '6-10', count: 0 },
    { range: '11-20', count: 0 },
    { range: '21+', count: 0 },
  ];

  userNotificationCounts.forEach(count => {
    if (count === 1) frequencyDistribution[0].count++;
    else if (count <= 5) frequencyDistribution[1].count++;
    else if (count <= 10) frequencyDistribution[2].count++;
    else if (count <= 20) frequencyDistribution[3].count++;
    else frequencyDistribution[4].count++;
  });

  // Find multi-game day users
  const userDailyMatches = new Map<string, { date: string; matches: Set<string> }[]>();
  notifications.forEach(n => {
    const userId = n.external_user_id || 'unknown';
    const sentDate = new Date(n.sent_at).toLocaleDateString();
    
    if (!userDailyMatches.has(userId)) {
      userDailyMatches.set(userId, []);
    }
    
    const userDays = userDailyMatches.get(userId)!;
    let dayEntry = userDays.find(d => d.date === sentDate);
    
    if (!dayEntry) {
      dayEntry = { date: sentDate, matches: new Set() };
      userDays.push(dayEntry);
    }
    
    if (n.match_id) {
      dayEntry.matches.add(`${n.home_team || 'Unknown'} vs ${n.away_team || 'Unknown'}`);
    }
  });

  const multiGameDayDetails = Array.from(userDailyMatches.entries())
    .flatMap(([userId, days]) => 
      days
        .filter(d => d.matches.size > 1)
        .map(d => ({ userId, date: d.date, matchCount: d.matches.size, matches: Array.from(d.matches) }))
    )
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 10);

  // Find potential duplicates
  const matchUserCombos = new Map<string, { count: number; sentAt: string[] }>();
  notifications.forEach(n => {
    if (n.match_id && n.external_user_id) {
      const key = `${n.external_user_id}_${n.match_id}`;
      const existing = matchUserCombos.get(key) || { count: 0, sentAt: [] };
      existing.count++;
      existing.sentAt.push(new Date(n.sent_at).toLocaleString());
      matchUserCombos.set(key, existing);
    }
  });

  const duplicates = Array.from(matchUserCombos.entries())
    .filter(([_, data]) => data.count > 1)
    .map(([key, data]) => {
      const [userId, matchId] = key.split('_');
      return { userId, matchId, count: data.count, sentAt: data.sentAt };
    })
    .slice(0, 10);

  const barColors = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))', 'hsl(var(--destructive))'];

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {userStats.duplicateNotifications > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Duplicate Notifications Detected</AlertTitle>
          <AlertDescription>
            {userStats.duplicateNotifications} duplicate notifications found (same user + same match).
            This could indicate a scheduler issue.
          </AlertDescription>
        </Alert>
      )}

      {userStats.duplicateNotifications === 0 && (
        <Alert className="border-secondary/50 bg-secondary/5">
          <CheckCircle className="h-4 w-4 text-secondary" />
          <AlertTitle>No Duplicates</AlertTitle>
          <AlertDescription>
            No duplicate notifications detected. Each user receives exactly 1 notification per match.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Unique Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.totalUsers.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Multi-Notification Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.usersWithMultipleNotifications.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((userStats.usersWithMultipleNotifications / userStats.totalUsers) * 100).toFixed(1)}% of users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Multi-Game Day Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.multiGameDayUsers}</div>
            <p className="text-xs text-muted-foreground">
              Received 2+ games in one day
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{userStats.duplicateNotifications}</span>
              {userStats.duplicateNotifications === 0 ? (
                <Badge variant="default" className="bg-secondary">Clean</Badge>
              ) : (
                <Badge variant="destructive">Alert</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notification Frequency Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Frequency Distribution</CardTitle>
          <CardDescription>How many notifications each user receives</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={frequencyDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {frequencyDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Game Day Details */}
      {multiGameDayDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Multi-Game Day Users</CardTitle>
            <CardDescription>Users who received notifications for multiple games on the same day</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Games</TableHead>
                  <TableHead>Matches</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {multiGameDayDetails.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{row.userId.slice(0, 12)}...</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.matchCount}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.matches.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Duplicate Details */}
      {duplicates.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Duplicate Notifications
            </CardTitle>
            <CardDescription>Same user received multiple notifications for the same match</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Match ID</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Sent Times</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{row.userId.slice(0, 12)}...</TableCell>
                    <TableCell>{row.matchId}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{row.count}x</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{row.sentAt.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
