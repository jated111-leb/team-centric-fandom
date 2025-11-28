import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatBaghdadTime } from "@/lib/timezone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BrazeSchedule {
  schedule_id: string;
  name: string;
  send_at: string;
  created_at: string;
  updated_at: string;
  messages?: any;
  trigger_properties?: {
    match_id?: number;
    home_en?: string;
    away_en?: string;
    competition_key?: string;
    kickoff_utc?: string;
  };
  dispatch_id?: string;
  send_id?: string;
}

export const BrazeSchedulesView = () => {
  const [schedules, setSchedules] = useState<BrazeSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<BrazeSchedule | null>(null);
  const { toast } = useToast();

  const fetchBrazeSchedules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-braze-schedules', {
        body: {},
      });

      if (error) throw error;

      if (data.success) {
        setSchedules(data.schedules || []);
        setLastFetched(new Date());
        toast({
          title: "Schedules Fetched",
          description: `Found ${data.total_schedules} scheduled notifications in Braze`,
        });
      } else {
        throw new Error(data.error || 'Failed to fetch schedules');
      }
    } catch (error) {
      console.error('Error fetching Braze schedules:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch Braze schedules",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteSchedule = async (schedule: BrazeSchedule) => {
    setDeletingScheduleId(schedule.schedule_id);
    try {
      const { data, error } = await supabase.functions.invoke('delete-braze-schedule', {
        body: { schedule_id: schedule.schedule_id },
      });

      if (error) throw error;

      if (data.success) {
        setSchedules(prev => prev.filter(s => s.schedule_id !== schedule.schedule_id));
        toast({
          title: "Schedule Deleted",
          description: "The notification has been removed from Braze",
        });
      } else {
        throw new Error(data.error || 'Failed to delete schedule');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete schedule",
        variant: "destructive",
      });
    } finally {
      setDeletingScheduleId(null);
      setScheduleToDelete(null);
    }
  };

  const getStatusBadge = (sendAt: string) => {
    const sendTime = new Date(sendAt);
    const now = new Date();

    if (sendTime > now) {
      return <Badge variant="secondary">Scheduled</Badge>;
    } else {
      return <Badge className="bg-status-finished text-white">Sent</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Braze Scheduled Notifications</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              View notifications currently scheduled in Braze for this campaign
            </p>
          </div>
          <Button 
            onClick={fetchBrazeSchedules} 
            disabled={loading}
            size="sm"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Fetch from Braze
          </Button>
        </div>
        {lastFetched && (
          <p className="text-xs text-muted-foreground mt-2">
            Last fetched: {formatBaghdadTime(lastFetched, 'MMM dd, yyyy HH:mm:ss')} Baghdad Time
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!lastFetched && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            Click "Fetch from Braze" to load scheduled notifications
          </div>
        )}

        {schedules.length === 0 && lastFetched && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            No scheduled notifications found in Braze
          </div>
        )}

        {schedules.length > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule ID</TableHead>
                  <TableHead>Match Details</TableHead>
                  <TableHead>Send Time (Baghdad)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dispatch ID</TableHead>
                  <TableHead>Send ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.schedule_id}>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {schedule.schedule_id.substring(0, 12)}...
                      </code>
                    </TableCell>
                    <TableCell>
                      {schedule.trigger_properties ? (
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {schedule.trigger_properties.home_en} vs {schedule.trigger_properties.away_en}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {schedule.trigger_properties.competition_key}
                            {schedule.trigger_properties.match_id && ` • Match ${schedule.trigger_properties.match_id}`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{schedule.name || 'No details'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>{formatBaghdadTime(new Date(schedule.send_at), 'MMM dd, yyyy HH:mm')}</div>
                      <div className="text-xs text-muted-foreground">Baghdad Time</div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(schedule.send_at)}
                    </TableCell>
                    <TableCell>
                      {schedule.dispatch_id ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {schedule.dispatch_id.substring(0, 8)}...
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {schedule.send_id ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {schedule.send_id.substring(0, 8)}...
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setScheduleToDelete(schedule)}
                        disabled={deletingScheduleId === schedule.schedule_id}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {deletingScheduleId === schedule.schedule_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!scheduleToDelete} onOpenChange={() => setScheduleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scheduled Notification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scheduled notification from Braze? This action cannot be undone.
              {scheduleToDelete && (
                <div className="mt-4 p-3 rounded-lg bg-muted text-sm">
                  <div className="font-medium">{scheduleToDelete.name || 'Unnamed notification'}</div>
                  <div className="text-muted-foreground mt-1">
                    Scheduled for: {formatBaghdadTime(new Date(scheduleToDelete.send_at), 'MMM dd, yyyy HH:mm')} Baghdad Time
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => scheduleToDelete && deleteSchedule(scheduleToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
