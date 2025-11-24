import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface BrazeSchedule {
  schedule_id: string;
  name: string;
  send_at: string;
  created_at: string;
  updated_at: string;
  messages?: any;
}

export const BrazeSchedulesView = () => {
  const [schedules, setSchedules] = useState<BrazeSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
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
            Last fetched: {format(lastFetched, 'MMM dd, yyyy HH:mm:ss')}
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
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Schedule ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Send Time (UTC)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Updated</TableHead>
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
                    <TableCell className="font-medium">
                      {schedule.name || 'Unnamed'}
                    </TableCell>
                    <TableCell>
                      {format(new Date(schedule.send_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(schedule.send_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(schedule.created_at), 'MMM dd, HH:mm')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(schedule.updated_at), 'MMM dd, HH:mm')}
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
