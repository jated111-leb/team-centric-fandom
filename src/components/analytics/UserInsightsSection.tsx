import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Users, UserCheck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { AnalyticsData } from "@/pages/Analytics";

interface UserInsightsSectionProps {
  data: AnalyticsData;
}

export function UserInsightsSection({ data }: UserInsightsSectionProps) {
  const { userStats, frequencyDistribution } = data;

  // Use server-computed frequency distribution
  const chartData = frequencyDistribution.length > 0 
    ? frequencyDistribution 
    : [
        { range: '1', count: 0 },
        { range: '2-5', count: 0 },
        { range: '6-10', count: 0 },
        { range: '11-20', count: 0 },
        { range: '21+', count: 0 },
      ];

  const barColors = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))', 'hsl(var(--destructive))'];

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {userStats.duplicateNotifications > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Duplicate Notifications Detected</AlertTitle>
          <AlertDescription>
            {userStats.duplicateNotifications.toLocaleString()} extra notifications sent to {userStats.usersWithDuplicates.toLocaleString()} users 
            (same user received same match multiple times). This indicates a webhook or scheduler issue.
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
            <p className="text-xs text-muted-foreground">Total reach</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Multi-Match Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userStats.multiMatchUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Received 2+ different matches
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Users with Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{userStats.usersWithDuplicates.toLocaleString()}</span>
              {userStats.usersWithDuplicates === 0 ? (
                <Badge variant="default" className="bg-secondary">Clean</Badge>
              ) : (
                <Badge variant="destructive">Bug</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Same match 2+ times
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Extra Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{userStats.duplicateNotifications.toLocaleString()}</span>
              {userStats.duplicateNotifications === 0 ? (
                <Badge variant="default" className="bg-secondary">Clean</Badge>
              ) : (
                <Badge variant="destructive">Alert</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Duplicate sends total
            </p>
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
              <BarChart data={chartData}>
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
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
