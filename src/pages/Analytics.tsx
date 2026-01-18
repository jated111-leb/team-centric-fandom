import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, RefreshCw, Users, TrendingUp, BarChart3, Calendar } from "lucide-react";
import { UserInsightsSection } from "@/components/analytics/UserInsightsSection";
import { ContentPerformanceSection } from "@/components/analytics/ContentPerformanceSection";
import { DeliveryHealthSection } from "@/components/analytics/DeliveryHealthSection";
import { ExecutiveKPIs } from "@/components/analytics/ExecutiveKPIs";
import { subDays } from "date-fns";

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
    todayUsers: number;
  };
  periodComparison: {
    currentPeriodNotifications: number;
    previousPeriodNotifications: number;
    currentPeriodUsers: number;
    previousPeriodUsers: number;
  };
  frequencyDistribution: { range: string; count: number }[];
  contentStats: {
    teamBreakdown: { team: string; count: number }[];
    competitionBreakdown: { competition: string; count: number }[];
    matchPerformance: { matchId: number; homeTeam: string; awayTeam: string; reach: number; uniqueUsers: number; competition: string; sentDate: string; correlationRate: number }[];
  };
  deliveryStats: {
    hourlyDistribution: { hour: number; count: number }[];
    correlationRate: number;
    naRate: number;
    avgWebhookLatency: number;
  };
}

interface ServerAnalyticsSummary {
  userStats: {
    totalUsers: number;
    usersWithMultiple: number;
    totalNotifications: number;
    avgNotificationsPerUser: number;
    todayUsers: number;
    multiGameDayUsers: number;
  };
  periodComparison: {
    currentPeriodNotifications: number;
    previousPeriodNotifications: number;
    currentPeriodUsers: number;
    previousPeriodUsers: number;
  };
  frequencyDistribution: { range: string; count: number }[] | null;
  deliveryStats: {
    correlationRate: number;
    naRate: number;
    totalSent: number;
    hourlyDistribution: { hour: number; count: number }[] | null;
  };
  contentStats: {
    byTeam: { team: string; count: number }[] | null;
    byCompetition: { competition: string; count: number }[] | null;
  };
  duplicates: {
    count: number;
    affectedUsers: number;
  };
  dateRange: {
    start: string;
    end: string;
  };
}

const DATE_RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

const Analytics = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState('30');
  const [serverStats, setServerStats] = useState<ServerAnalyticsSummary | null>(null);

  useEffect(() => {
    checkAdminAndFetchData();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchAnalyticsData();
    }
  }, [dateRange]);

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
      
      // Calculate date range
      const endDate = new Date();
      let startDate: Date | null = null;
      
      if (dateRange !== 'all') {
        startDate = subDays(endDate, parseInt(dateRange));
      }

      // Call server-side aggregation function (handles all heavy computation in DB)
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('compute_analytics_summary', {
          p_start_date: startDate?.toISOString() || null,
          p_end_date: endDate.toISOString()
        });

      if (summaryError) {
        console.error('Server aggregation error:', summaryError);
        throw summaryError;
      }

      const summary = summaryData as unknown as ServerAnalyticsSummary;
      setServerStats(summary);

      // Convert server stats to AnalyticsData format (for compatibility with existing components)
      const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => {
        const found = summary.deliveryStats.hourlyDistribution?.find(h => h.hour === hour);
        return { hour, count: found?.count || 0 };
      });

      const teamBreakdown = (summary.contentStats.byTeam || []).map(t => ({
        team: t.team,
        count: t.count
      }));

      const competitionBreakdown = (summary.contentStats.byCompetition || []).map(c => ({
        competition: c.competition,
        count: c.count
      }));

      // Fetch match performance data (paginated, only top 20 matches)
      const matchPerformance = await fetchTopMatchPerformance(startDate, endDate);

      setAnalyticsData({
        notifications: [], // We don't need raw notifications anymore for summary views
        userStats: {
          totalUsers: summary.userStats.totalUsers || 0,
          usersWithMultipleNotifications: summary.userStats.usersWithMultiple || 0,
          duplicateNotifications: summary.duplicates.count || 0,
          multiGameDayUsers: summary.userStats.multiGameDayUsers || 0,
          todayUsers: summary.userStats.todayUsers || 0
        },
        periodComparison: {
          currentPeriodNotifications: summary.periodComparison?.currentPeriodNotifications || 0,
          previousPeriodNotifications: summary.periodComparison?.previousPeriodNotifications || 0,
          currentPeriodUsers: summary.periodComparison?.currentPeriodUsers || 0,
          previousPeriodUsers: summary.periodComparison?.previousPeriodUsers || 0
        },
        frequencyDistribution: summary.frequencyDistribution || [],
        contentStats: {
          teamBreakdown,
          competitionBreakdown,
          matchPerformance
        },
        deliveryStats: {
          hourlyDistribution,
          correlationRate: summary.deliveryStats.correlationRate || 0,
          naRate: summary.deliveryStats.naRate || 0,
          avgWebhookLatency: 0 // Computed separately if needed
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

  const fetchTopMatchPerformance = async (startDate: Date | null, endDate: Date): Promise<AnalyticsData['contentStats']['matchPerformance']> => {
    try {
      let query = supabase
        .from('notification_sends')
        .select('match_id, home_team, away_team, competition, external_user_id, sent_at')
        .not('match_id', 'is', null);
      
      if (startDate) {
        query = query.gte('sent_at', startDate.toISOString());
      }
      query = query.lte('sent_at', endDate.toISOString());

      const { data, error } = await query.limit(1000);
      
      if (error) throw error;

      // Aggregate match performance client-side (limited data)
      const matchMap = new Map<number, { 
        homeTeam: string; 
        awayTeam: string; 
        competition: string;
        sentDate: string;
        reach: number; 
        correlated: number;
        users: Set<string>;
      }>();
      
      (data || []).forEach(n => {
        if (!n.match_id) return;
        const existing = matchMap.get(n.match_id) || {
          homeTeam: n.home_team || 'N/A',
          awayTeam: n.away_team || 'N/A',
          competition: n.competition || 'N/A',
          sentDate: n.sent_at?.split('T')[0] || 'N/A',
          reach: 0,
          correlated: 0,
          users: new Set<string>()
        };
        existing.reach++;
        if (n.home_team && n.away_team) {
          existing.correlated++;
        }
        if (n.external_user_id) {
          existing.users.add(n.external_user_id);
        }
        matchMap.set(n.match_id, existing);
      });

      return Array.from(matchMap.entries())
        .map(([matchId, data]) => ({
          matchId,
          homeTeam: data.homeTeam,
          awayTeam: data.awayTeam,
          competition: data.competition,
          sentDate: data.sentDate,
          reach: data.reach,
          uniqueUsers: data.users.size,
          correlationRate: data.reach > 0 ? (data.correlated / data.reach) * 100 : 0
        }))
        .sort((a, b) => b.reach - a.reach)
        .slice(0, 20);
    } catch (error) {
      console.error('Error fetching match performance:', error);
      return [];
    }
  };

  const handleExport = () => {
    if (!analyticsData || !serverStats) return;
    
    const report = {
      generatedAt: new Date().toISOString(),
      dateRange: {
        start: serverStats.dateRange.start,
        end: serverStats.dateRange.end
      },
      summary: {
        totalNotifications: serverStats.userStats.totalNotifications,
        totalUsers: serverStats.userStats.totalUsers,
        usersWithMultipleNotifications: serverStats.userStats.usersWithMultiple,
        duplicateNotifications: serverStats.duplicates.count,
        correlationRate: analyticsData.deliveryStats.correlationRate.toFixed(2) + '%',
        naRate: analyticsData.deliveryStats.naRate.toFixed(2) + '%'
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
    <div className="bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Growth Marketing Analytics</h1>
            <p className="text-muted-foreground">
              User insights, content performance, and delivery health
              {serverStats && (
                <span className="ml-2 text-sm">
                  • {serverStats.userStats.totalNotifications?.toLocaleString() || 0} notifications
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_RANGE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={fetchAnalyticsData} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={handleExport} disabled={!analyticsData}>
              <Download className="h-4 w-4 mr-2" />
              Export
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
