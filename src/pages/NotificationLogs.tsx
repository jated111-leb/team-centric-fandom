import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Filter, LogOut } from "lucide-react";
import { formatBaghdadTime } from "@/lib/timezone";

interface NotificationSend {
  id: string;
  external_user_id: string | null;
  braze_event_type: string;
  match_id: number | null;
  braze_schedule_id: string | null;
  campaign_id: string | null;
  home_team: string | null;
  away_team: string | null;
  competition: string | null;
  kickoff_utc: string | null;
  sent_at: string;
  event_received_at: string;
  created_at: string;
}

const NotificationLogs = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<NotificationSend[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<NotificationSend[]>([]);
  
  // Filters
  const [userIdFilter, setUserIdFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [competitionFilter, setCompetitionFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("today");

  // Stats
  const [stats, setStats] = useState({
    totalToday: 0,
    totalWeek: 0,
    uniqueUsers: 0,
    byEventType: {} as Record<string, number>,
  });

  useEffect(() => {
    checkAdminAndFetchLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, userIdFilter, eventTypeFilter, competitionFilter, dateFilter]);

  useEffect(() => {
    // Set up realtime subscription
    const channel = supabase
      .channel('notification-logs-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_sends'
        },
        (payload) => {
          console.log('New notification send:', payload);
          setLogs(prev => [payload.new as NotificationSend, ...prev]);
          toast({
            title: "New Notification Logged",
            description: `Event: ${(payload.new as NotificationSend).braze_event_type}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAdminAndFetchLogs = async () => {
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
          description: "You must be an admin to view notification logs.",
          variant: "destructive",
        });
        navigate('/admin');
        return;
      }

      await fetchLogs();
    } catch (error: any) {
      console.error('Error checking admin access:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notification_sends')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      setLogs(data || []);
      calculateStats(data || []);
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch notification logs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: NotificationSend[]) => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(now.setDate(now.getDate() - 7));

    const totalToday = data.filter(log => new Date(log.sent_at) >= todayStart).length;
    const totalWeek = data.filter(log => new Date(log.sent_at) >= weekStart).length;
    const uniqueUsers = new Set(data.map(log => log.external_user_id)).size;
    
    const byEventType: Record<string, number> = {};
    data.forEach(log => {
      byEventType[log.braze_event_type] = (byEventType[log.braze_event_type] || 0) + 1;
    });

    setStats({ totalToday, totalWeek, uniqueUsers, byEventType });
  };

  const applyFilters = () => {
    let filtered = [...logs];

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      let startDate: Date;
      
      switch (dateFilter) {
        case "today":
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case "week":
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case "month":
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(0);
      }
      
      filtered = filtered.filter(log => new Date(log.sent_at) >= startDate);
    }

    // User ID filter
    if (userIdFilter.trim()) {
      filtered = filtered.filter(log => 
        log.external_user_id?.toLowerCase().includes(userIdFilter.toLowerCase())
      );
    }

    // Event type filter
    if (eventTypeFilter !== "all") {
      filtered = filtered.filter(log => log.braze_event_type === eventTypeFilter);
    }

    // Competition filter
    if (competitionFilter !== "all") {
      filtered = filtered.filter(log => log.competition === competitionFilter);
    }

    setFilteredLogs(filtered);
  };

  const exportToCSV = () => {
    const csv = [
      ['User ID', 'Event Type', 'Match', 'Competition', 'Sent At', 'Match ID'].join(','),
      ...filteredLogs.map(log => [
        log.external_user_id || '',
        log.braze_event_type,
        log.home_team && log.away_team ? `${log.home_team} vs ${log.away_team}` : '',
        log.competition || '',
        formatBaghdadTime(new Date(log.sent_at)),
        log.match_id || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notification-logs-${new Date().toISOString()}.csv`;
    a.click();
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
      toast({
        title: 'Error',
        description: 'Failed to log out',
        variant: 'destructive',
      });
    }
  };

  const getEventBadgeVariant = (eventType: string) => {
    if (eventType.includes('send') || eventType.includes('Send')) return "default";
    if (eventType.includes('bounce') || eventType.includes('Bounce')) return "destructive";
    if (eventType.includes('deliver')) return "default";
    return "secondary";
  };

  const uniqueEventTypes = Array.from(new Set(logs.map(l => l.braze_event_type)));
  const uniqueCompetitions = Array.from(new Set(logs.map(l => l.competition).filter(Boolean)));

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/admin')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Notification Logs</h1>
              <p className="text-muted-foreground">Track all sent notifications in real-time</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportToCSV} disabled={filteredLogs.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={handleLogout} variant="ghost">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalToday}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalWeek}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{logs.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">User ID</label>
                <Input 
                  placeholder="Search user..." 
                  value={userIdFilter}
                  onChange={(e) => setUserIdFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Event Type</label>
                <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {uniqueEventTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Competition</label>
                <Select value={competitionFilter} onValueChange={setCompetitionFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Competitions</SelectItem>
                    {uniqueCompetitions.map(comp => (
                      <SelectItem key={comp} value={comp!}>{comp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Sends ({filteredLogs.length})</CardTitle>
            <CardDescription>
              Showing {filteredLogs.length} of {logs.length} total logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User ID</TableHead>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead>Competition</TableHead>
                      <TableHead>Sent At (Baghdad)</TableHead>
                      <TableHead>Match ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No notification logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            {log.external_user_id || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getEventBadgeVariant(log.braze_event_type)}>
                              {log.braze_event_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.home_team && log.away_team ? (
                              <span className="text-sm">
                                {log.home_team} vs {log.away_team}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.competition || <span className="text-muted-foreground">N/A</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatBaghdadTime(new Date(log.sent_at))}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {log.match_id || 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NotificationLogs;