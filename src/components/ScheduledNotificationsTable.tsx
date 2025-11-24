import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ScheduledNotification {
  id: string;
  match_id: number;
  braze_schedule_id: string;
  send_at_utc: string;
  signature: string;
  created_at: string;
  updated_at: string;
  matches: {
    home_team: string;
    away_team: string;
    competition_name: string;
    match_date: string;
    match_time: string;
  } | null;
}

export const ScheduledNotificationsTable = () => {
  const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchNotifications();

    // Set up realtime subscription
    const channel = supabase
      .channel('schedule-ledger-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedule_ledger'
        },
        () => {
          console.log('Schedule ledger changed, refreshing...');
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('schedule_ledger')
        .select(`
          *,
          matches (
            home_team,
            away_team,
            competition_name,
            match_date,
            match_time
          )
        `)
        .order('send_at_utc', { ascending: false })
        .limit(50);

      if (error) throw error;

      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast({
        title: "Error",
        description: "Failed to load scheduled notifications",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (sendAtUtc: string) => {
    const sendTime = new Date(sendAtUtc);
    const now = new Date();

    if (sendTime > now) {
      return <Badge variant="secondary">Scheduled</Badge>;
    } else {
      return <Badge className="bg-status-finished text-white">Sent</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scheduled Notifications</CardTitle>
        <p className="text-sm text-muted-foreground">
          Showing {notifications.length} most recent scheduled notifications
        </p>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No scheduled notifications found
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Match Date</TableHead>
                  <TableHead>Send Time (UTC)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Braze Schedule ID</TableHead>
                  <TableHead>Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell className="font-medium">
                      {notification.matches ? (
                        <div className="whitespace-nowrap">
                          {notification.matches.home_team} vs {notification.matches.away_team}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Match data unavailable</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {notification.matches?.competition_name || "—"}
                    </TableCell>
                    <TableCell>
                      {notification.matches?.match_date ? (
                        <div>
                          <div>{format(new Date(notification.matches.match_date), 'MMM dd, yyyy')}</div>
                          {notification.matches.match_time && (
                            <div className="text-xs text-muted-foreground">
                              {notification.matches.match_time}
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(notification.send_at_utc), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(notification.send_at_utc)}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {notification.braze_schedule_id.substring(0, 12)}...
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(notification.updated_at), 'MMM dd, HH:mm')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
