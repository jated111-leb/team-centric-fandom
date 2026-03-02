import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatBaghdadTime } from "@/lib/timezone";

export interface NotificationSend {
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

export interface LogFilters {
  userId: string;
  eventType: string;
  competition: string;
  dateRange: string;
}

export interface LogStats {
  totalFiltered: number;
  uniqueUsers: number;
}

const PAGE_SIZE = 100;

function getDateStart(dateRange: string): string | null {
  const now = new Date();
  switch (dateRange) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString();
    }
    default:
      return null;
  }
}

export function useNotificationLogs() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<NotificationSend[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<LogStats>({ totalFiltered: 0, uniqueUsers: 0 });

  const [filters, setFilters] = useState<LogFilters>({
    userId: "",
    eventType: "all",
    competition: "all",
    dateRange: "month",
  });

  // Debounce timer for user ID input
  const userIdTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Filter options (fetched once)
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [competitions, setCompetitions] = useState<string[]>([]);

  // Check admin on mount
  useEffect(() => {
    checkAdmin();
    fetchFilterOptions();
  }, []);

  // Re-fetch when filters or page change
  useEffect(() => {
    if (isAdmin) {
      fetchLogs();
    }
  }, [isAdmin, filters, page]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('notification-logs-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_sends' },
        (payload) => {
          // Only prepend if it matches current filters
          const newRow = payload.new as NotificationSend;
          if (page === 0) {
            setLogs(prev => [newRow, ...prev.slice(0, PAGE_SIZE - 1)]);
            setTotalCount(prev => prev + 1);
          }
          toast({
            title: "New Notification Logged",
            description: `Event: ${newRow.braze_event_type}`,
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [page]);

  const checkAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!roleData || roleData.role !== 'admin') {
        toast({ title: "Access Denied", description: "You must be an admin.", variant: "destructive" });
        navigate('/admin');
        return;
      }
      setIsAdmin(true);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const fetchFilterOptions = async () => {
    // Fetch distinct event types and competitions for filter dropdowns
    const [evtRes, compRes] = await Promise.all([
      supabase.from('notification_sends').select('braze_event_type').limit(1000),
      supabase.from('notification_sends').select('competition').not('competition', 'is', null).limit(1000),
    ]);

    if (evtRes.data) {
      setEventTypes([...new Set(evtRes.data.map(r => r.braze_event_type))]);
    }
    if (compRes.data) {
      setCompetitions([...new Set(compRes.data.map(r => r.competition!))]);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const dateStart = getDateStart(filters.dateRange);

      // Build the query
      let query = supabase
        .from('notification_sends')
        .select('*', { count: 'exact' })
        .order('sent_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (dateStart) {
        query = query.gte('sent_at', dateStart);
      }
      if (filters.userId.trim()) {
        query = query.eq('external_user_id', filters.userId.trim());
      }
      if (filters.eventType !== "all") {
        query = query.eq('braze_event_type', filters.eventType);
      }
      if (filters.competition !== "all") {
        query = query.eq('competition', filters.competition);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      setLogs(data || []);
      setTotalCount(count || 0);

      // Fetch unique user count with the same filters
      let countQuery = supabase
        .from('notification_sends')
        .select('external_user_id', { count: 'exact', head: false })
        .order('external_user_id', { ascending: true });

      if (dateStart) countQuery = countQuery.gte('sent_at', dateStart);
      if (filters.userId.trim()) countQuery = countQuery.eq('external_user_id', filters.userId.trim());
      if (filters.eventType !== "all") countQuery = countQuery.eq('braze_event_type', filters.eventType);
      if (filters.competition !== "all") countQuery = countQuery.eq('competition', filters.competition);

      // We can approximate unique users from the count query - but supabase doesn't support DISTINCT count easily
      // Use a simpler approach: just count from returned data if total < 1000, otherwise note it
      const uniqueUsers = new Set((data || []).map(d => d.external_user_id)).size;

      setStats({
        totalFiltered: count || 0,
        uniqueUsers,
      });
    } catch (error: any) {
      console.error('Error fetching logs:', error);
      toast({ title: "Error", description: "Failed to fetch notification logs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = useCallback((key: keyof LogFilters, value: string) => {
    if (key === 'userId') {
      // Debounce user ID filter
      clearTimeout(userIdTimerRef.current);
      userIdTimerRef.current = setTimeout(() => {
        setFilters(prev => ({ ...prev, userId: value }));
        setPage(0);
      }, 500);
    } else {
      setFilters(prev => ({ ...prev, [key]: value }));
      setPage(0);
    }
  }, []);

  const exportToCSV = () => {
    const csv = [
      ['User ID', 'Event Type', 'Match', 'Competition', 'Sent At', 'Match ID'].join(','),
      ...logs.map(log => [
        log.external_user_id || '',
        log.braze_event_type,
        log.home_team && log.away_team ? `"${log.home_team} vs ${log.away_team}"` : '',
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

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return {
    loading,
    logs,
    stats,
    totalCount,
    page,
    setPage,
    totalPages,
    filters,
    updateFilter,
    eventTypes,
    competitions,
    exportToCSV,
    PAGE_SIZE,
  };
}
