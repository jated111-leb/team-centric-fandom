import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, LogOut, RefreshCw, Users, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";
import { UserInsightsSection } from "@/components/analytics/UserInsightsSection";
import { ContentPerformanceSection } from "@/components/analytics/ContentPerformanceSection";
import { DeliveryHealthSection } from "@/components/analytics/DeliveryHealthSection";
import { ExecutiveKPIs } from "@/components/analytics/ExecutiveKPIs";

export interface NotificationAnalytics {
  id: string;
  external_user_id: string | null;
  braze_event_type: string;
  match_id: number | null;
  home_team: string | null;
  away_team: string | null;
  competition: string | null;
  kickoff_utc: string | null;
  sent_at: string;
  event_received_at: string;
  created_at: string;
}

export interface AnalyticsData {
  notifications: NotificationAnalytics[];
  userStats: {
    totalUsers: number;
    usersWithMultipleNotifications: number;
    duplicateNotifications: number;
    multiGameDayUsers: number;
  };
  contentStats: {
    teamBreakdown: { team: string; count: number }[];
    competitionBreakdown: { competition: string; count: number }[];
    matchPerformance: { matchId: number; homeTeam: string; awayTeam: string; reach: number; correlationRate: number }[];
  };
  deliveryStats: {
    hourlyDistribution: { hour: number; count: number }[];
    correlationRate: number;
    naRate: number;
    avgWebhookLatency: number;
  };
}

const Analytics = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    checkAdminAndFetchData();
  }, []);

  const checkAdminAndFetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!roleData || roleData.role !== 'admin') {
        toast({
          title: "Access Denied",
          description: "You must be an admin to view analytics.",
          variant: "destructive",
        });
        navigate('/admin');
        return;
      }

      await fetchAnalyticsData();
    } catch (error: any) {
      console.error('Error checking admin access:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchAnalyticsData = async () => {
    try {
      setRefreshing(true);
      
      // Fetch all notification sends
      const { data: notifications, error } = await supabase
        .from('notification_sends')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(5000);

      if (error) throw error;

      const data = notifications || [];
      
      // Calculate user stats
      const userNotificationCounts = new Map<string, number>();
      const userDailyMatches = new Map<string, Set<string>>();
      const matchUserCombos = new Set<string>();
      let duplicateCount = 0;

      data.forEach(n => {
        const userId = n.external_user_id || 'unknown';
        userNotificationCounts.set(userId, (userNotificationCounts.get(userId) || 0) + 1);
        
        // Check for multi-game day
        const sentDate = new Date(n.sent_at).toDateString();
        const dayKey = `${userId}_${sentDate}`;
        if (!userDailyMatches.has(dayKey)) {
          userDailyMatches.set(dayKey, new Set());
        }
        if (n.match_id) {
          userDailyMatches.get(dayKey)!.add(n.match_id.toString());
        }
        
        // Check for duplicates
        const combo = `${userId}_${n.match_id}`;
        if (matchUserCombos.has(combo)) {
          duplicateCount++;
        }
        matchUserCombos.add(combo);
      });

      const usersWithMultiple = Array.from(userNotificationCounts.values()).filter(c => c > 1).length;
      const multiGameDayUsers = Array.from(userDailyMatches.values()).filter(matches => matches.size > 1).length;

      // Calculate content stats
      const teamCounts = new Map<string, number>();
      const competitionCounts = new Map<string, number>();
      const matchPerformanceMap = new Map<number, { homeTeam: string; awayTeam: string; reach: number; correlated: number }>();

      data.forEach(n => {
        // Team counts
        if (n.home_team) {
          teamCounts.set(n.home_team, (teamCounts.get(n.home_team) || 0) + 1);
        }
        if (n.away_team) {
          teamCounts.set(n.away_team, (teamCounts.get(n.away_team) || 0) + 1);
        }
        
        // Competition counts
        const comp = n.competition || 'Unknown';
        competitionCounts.set(comp, (competitionCounts.get(comp) || 0) + 1);
        
        // Match performance
        if (n.match_id) {
          const existing = matchPerformanceMap.get(n.match_id) || {
            homeTeam: n.home_team || 'N/A',
            awayTeam: n.away_team || 'N/A',
            reach: 0,
            correlated: 0
          };
          existing.reach++;
          if (n.home_team && n.away_team) {
            existing.correlated++;
          }
          matchPerformanceMap.set(n.match_id, existing);
        }
      });

      const teamBreakdown = Array.from(teamCounts.entries())
        .map(([team, count]) => ({ team, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const competitionBreakdown = Array.from(competitionCounts.entries())
        .map(([competition, count]) => ({ competition, count }))
        .sort((a, b) => b.count - a.count);

      const matchPerformance = Array.from(matchPerformanceMap.entries())
        .map(([matchId, data]) => ({
          matchId,
          homeTeam: data.homeTeam,
          awayTeam: data.awayTeam,
          reach: data.reach,
          correlationRate: data.reach > 0 ? (data.correlated / data.reach) * 100 : 0
        }))
        .sort((a, b) => b.reach - a.reach)
        .slice(0, 20);

      // Calculate delivery stats
      const hourCounts = new Map<number, number>();
      let correlatedCount = 0;
      let totalLatency = 0;
      let latencyCount = 0;

      data.forEach(n => {
        const hour = new Date(n.sent_at).getUTCHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        
        if (n.home_team && n.away_team && n.match_id) {
          correlatedCount++;
        }
        
        if (n.event_received_at && n.sent_at) {
          const latency = new Date(n.event_received_at).getTime() - new Date(n.sent_at).getTime();
          if (latency > 0 && latency < 3600000) { // Within 1 hour
            totalLatency += latency;
            latencyCount++;
          }
        }
      });

      const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        count: hourCounts.get(hour) || 0
      }));

      const correlationRate = data.length > 0 ? (correlatedCount / data.length) * 100 : 0;
      const naRate = 100 - correlationRate;
      const avgWebhookLatency = latencyCount > 0 ? totalLatency / latencyCount / 1000 : 0; // in seconds

      setAnalyticsData({
        notifications: data,
        userStats: {
          totalUsers: userNotificationCounts.size,
          usersWithMultipleNotifications: usersWithMultiple,
          duplicateNotifications: duplicateCount,
          multiGameDayUsers
        },
        contentStats: {
          teamBreakdown,
          competitionBreakdown,
          matchPerformance
        },
        deliveryStats: {
          hourlyDistribution,
          correlationRate,
          naRate,
          avgWebhookLatency
        }
      });

    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      toast({
        title: "Error",
        description: "Failed to fetch analytics data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: 'Logged out',
        description: 'You have been logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const exportAnalytics = () => {
    if (!analyticsData) return;
    
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalNotifications: analyticsData.notifications.length,
        ...analyticsData.userStats,
        correlationRate: analyticsData.deliveryStats.correlationRate.toFixed(2) + '%',
        avgWebhookLatency: analyticsData.deliveryStats.avgWebhookLatency.toFixed(2) + 's'
      },
      teamBreakdown: analyticsData.contentStats.teamBreakdown,
      competitionBreakdown: analyticsData.contentStats.competitionBreakdown
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Growth Marketing Analytics</h1>
              <p className="text-muted-foreground">User insights, content performance, and delivery health</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchAnalyticsData} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={exportAnalytics} disabled={!analyticsData}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
            <Button onClick={handleLogout} variant="ghost">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Executive KPIs */}
        {analyticsData && <ExecutiveKPIs data={analyticsData} />}

        {/* Tabbed Sections */}
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              User Insights
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Content Performance
            </TabsTrigger>
            <TabsTrigger value="delivery" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Delivery Health
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            {analyticsData && <UserInsightsSection data={analyticsData} />}
          </TabsContent>

          <TabsContent value="content">
            {analyticsData && <ContentPerformanceSection data={analyticsData} />}
          </TabsContent>

          <TabsContent value="delivery">
            {analyticsData && <DeliveryHealthSection data={analyticsData} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Analytics;
