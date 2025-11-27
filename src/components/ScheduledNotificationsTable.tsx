import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBaghdadTime } from "@/lib/timezone";

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
  const [verifying, setVerifying] = useState(false);
  const [verificationResults, setVerificationResults] = useState<{
    total: number;
    verified: string[];
    missing: string[];
    errors: { schedule_id: string; error: string }[];
  } | null>(null);
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
        .order('send_at_utc', { ascending: true })
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

  const verifySchedules = async () => {
    setVerifying(true);
    setVerificationResults(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to verify schedules",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-braze-schedules`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Verification failed');
      }

      setVerificationResults(result);
      
      if (result.missing.length > 0) {
        toast({
          title: "Verification complete",
          description: `${result.verified.length} schedules verified, ${result.missing.length} missing in Braze`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "All schedules verified",
          description: `All ${result.verified.length} schedules exist in Braze`,
        });
      }
    } catch (error) {
      console.error('Error verifying schedules:', error);
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify schedules",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scheduled Notifications (Source of Truth)</CardTitle>
            <CardDescription>
              Showing {notifications.length} most recent scheduled notifications from the database
            </CardDescription>
          </div>
          <Button 
            onClick={verifySchedules} 
            disabled={verifying || notifications.length === 0}
            variant="outline"
          >
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Verify with Braze
              </>
            )}
          </Button>
        </div>
        
        {verificationResults && (
          <div className="mt-4 p-4 rounded-lg border bg-muted/50 space-y-2">
            <h4 className="font-semibold text-sm">Verification Results</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span><strong>{verificationResults.verified.length}</strong> Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span><strong>{verificationResults.missing.length}</strong> Missing</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span><strong>{verificationResults.errors.length}</strong> Errors</span>
              </div>
            </div>
            {verificationResults.missing.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                <p className="font-medium">Missing schedule IDs:</p>
                <ul className="list-disc list-inside mt-1">
                  {verificationResults.missing.slice(0, 5).map((id) => (
                    <li key={id}><code className="text-xs">{id.substring(0, 12)}...</code></li>
                  ))}
                  {verificationResults.missing.length > 5 && (
                    <li>... and {verificationResults.missing.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No scheduled notifications found
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match</TableHead>
                  <TableHead>Competition</TableHead>
                  <TableHead>Match Date</TableHead>
                  <TableHead>Send Time (Baghdad)</TableHead>
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
                          <div>{formatBaghdadTime(new Date(notification.matches.match_date), 'MMM dd, yyyy')}</div>
                          {notification.matches.match_time && (
                            <div className="text-xs text-muted-foreground">
                              {notification.matches.match_time} Baghdad
                            </div>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{formatBaghdadTime(new Date(notification.send_at_utc), 'MMM dd, yyyy HH:mm')}</div>
                      <div className="text-xs text-muted-foreground">Baghdad Time</div>
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
                      {formatBaghdadTime(new Date(notification.updated_at), 'MMM dd, HH:mm')}
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
