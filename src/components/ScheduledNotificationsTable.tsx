import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, XCircle, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
  const [resetting, setResetting] = useState(false);
  const [verificationResults, setVerificationResults] = useState<{
    total: number;
    confirmed: any[];
    missing_dispatch_id: any[];
    stale_pending: any[];
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

      // Extract from result.details (verify-braze-schedules response structure)
      const confirmed = result.details?.confirmed || [];
      const missing_dispatch_id = result.details?.missing_dispatch_id || [];
      const stale_pending = result.alerts?.stale_pending || [];
      
      const normalizedResults = {
        total: result.summary?.total || confirmed.length,
        confirmed,
        missing_dispatch_id,
        stale_pending,
      };

      setVerificationResults(normalizedResults);
      
      if (missing_dispatch_id.length > 0 || stale_pending.length > 0) {
        toast({
          title: "Issues detected",
          description: `${missing_dispatch_id.length} missing dispatch_id, ${stale_pending.length} stale`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "All schedules confirmed",
          description: `All ${confirmed.length} schedules have valid dispatch_id`,
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

  const resetSchedules = async () => {
    setResetting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please log in to reset schedules",
          variant: "destructive",
        });
        return;
      }

      // Step 1: Force release any stuck locks
      toast({
        title: "Step 1/3: Releasing locks...",
        description: "Clearing any stuck scheduler locks",
      });

      const { error: lockError } = await supabase
        .from('scheduler_locks')
        .update({ 
          locked_at: null, 
          locked_by: null, 
          expires_at: null 
        })
        .eq('lock_name', 'braze-scheduler');

      if (lockError) {
        console.warn('Failed to release lock:', lockError);
        // Continue anyway - lock might not exist
      }

      // Step 2: Clear pending schedules from ledger
      toast({
        title: "Step 2/3: Clearing pending schedules...",
        description: "Removing entries that don't exist in Braze",
      });

      const { error: deleteError } = await supabase
        .from('schedule_ledger')
        .delete()
        .eq('status', 'pending');

      if (deleteError) {
        throw new Error(`Failed to clear ledger: ${deleteError.message}`);
      }

      toast({
        title: "Step 3/3: Triggering scheduler...",
        description: "Creating fresh schedules in Braze",
      });

      // Step 3: Trigger the scheduler to create fresh schedules
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/braze-scheduler`,
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
        throw new Error(result.error || result.message || 'Scheduler failed');
      }

      toast({
        title: "Reset complete!",
        description: `Scheduled ${result.scheduled || 0} notifications (${result.updated || 0} updated, ${result.skipped || 0} skipped)`,
      });

      // Refresh the table
      fetchNotifications();
      setVerificationResults(null);

    } catch (error) {
      console.error('Error resetting schedules:', error);
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Failed to reset schedules",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
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

  const headerButtons = (
    <div className="flex gap-2">
      <Button 
        onClick={verifySchedules} 
        disabled={verifying || notifications.length === 0}
        variant="outline"
        size="sm"
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
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="destructive"
            size="sm"
            disabled={resetting || notifications.length === 0}
          >
            {resetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Reset
              </>
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Schedules?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all pending schedules from the database and trigger a fresh scheduler run to recreate them in Braze. Use this when schedules are out of sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={resetSchedules}>
              Reset Schedules
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <CollapsibleCard
      title="Scheduled Notifications (Source of Truth)"
      description={`Showing ${notifications.length} most recent scheduled notifications from the database`}
      headerExtra={headerButtons}
      defaultOpen={false}
    >
      <div className="space-y-4">
        {verificationResults && (
          <div className="p-4 rounded-lg border bg-muted/50 space-y-2">
            <h4 className="font-semibold text-sm">Verification Results</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span><strong>{verificationResults.confirmed.length}</strong> Confirmed</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span><strong>{verificationResults.missing_dispatch_id.length}</strong> Missing ID</span>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <span><strong>{verificationResults.stale_pending.length}</strong> Stale</span>
              </div>
            </div>
            {verificationResults.missing_dispatch_id.length > 0 && (
              <div className="text-xs text-muted-foreground mt-2">
                <p className="font-medium">Missing dispatch_id:</p>
                <ul className="list-disc list-inside mt-1">
                  {verificationResults.missing_dispatch_id.slice(0, 5).map((item, idx) => (
                    <li key={item.schedule_id || idx}>
                      <code className="text-xs">{String(item.schedule_id || item).substring(0, 12)}...</code>
                      {item.home_team && <span className="ml-2 text-muted-foreground">({item.home_team} vs {item.away_team})</span>}
                    </li>
                  ))}
                  {verificationResults.missing_dispatch_id.length > 5 && (
                    <li>... and {verificationResults.missing_dispatch_id.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
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
      </div>
    </CollapsibleCard>
  );
};
