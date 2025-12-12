import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Button } from '@/components/ui/button';
import { Loader2, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SchedulerLog {
  id: string;
  function_name: string;
  match_id: number | null;
  action: string;
  reason: string | null;
  details: any;
  created_at: string;
}

export function SchedulerStats() {
  const [logs, setLogs] = useState<SchedulerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScheduler, setRunningScheduler] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduler_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const runScheduler = async () => {
    setRunningScheduler(true);
    try {
      const { data, error } = await supabase.functions.invoke('braze-scheduler');
      
      if (error) throw error;
      
      toast({
        title: 'Scheduler Run Complete',
        description: `Scheduled: ${data.scheduled}, Updated: ${data.updated}, Skipped: ${data.skipped}`,
      });
      
      fetchLogs();
    } catch (error) {
      console.error('Error running scheduler:', error);
      toast({
        title: 'Error',
        description: 'Failed to run scheduler',
        variant: 'destructive',
      });
    } finally {
      setRunningScheduler(false);
    }
  };

  // Calculate statistics
  const stats = {
    total: logs.length,
    byAction: logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byFunction: logs.reduce((acc, log) => {
      acc[log.function_name] = (acc[log.function_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    recentErrors: logs.filter(l => l.action === 'error').slice(0, 5),
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const runButton = (
    <Button
      onClick={runScheduler}
      disabled={runningScheduler}
      size="sm"
      variant="outline"
    >
      {runningScheduler ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Play className="h-4 w-4 mr-2" />
      )}
      Run Scheduler
    </Button>
  );

  return (
    <CollapsibleCard
      title="Scheduler Statistics & Controls"
      description="Monitor scheduler activity and manually trigger operations"
      headerExtra={runButton}
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground">
              {stats.byAction.created || 0}
            </div>
            <div className="text-sm text-muted-foreground">Created</div>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground">
              {stats.byAction.updated || 0}
            </div>
            <div className="text-sm text-muted-foreground">Updated</div>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <div className="text-2xl font-bold text-foreground">
              {stats.byAction.skipped || 0}
            </div>
            <div className="text-sm text-muted-foreground">Skipped</div>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <div className="text-2xl font-bold text-destructive">
              {stats.byAction.error || 0}
            </div>
            <div className="text-sm text-muted-foreground">Errors</div>
          </div>
        </div>

        {/* Recent Errors */}
        {stats.recentErrors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Recent Errors</h3>
            <div className="space-y-2">
              {stats.recentErrors.map((error) => (
                <div
                  key={error.id}
                  className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="font-medium text-destructive">
                        {error.function_name}
                        {error.match_id && ` - Match ${error.match_id}`}
                      </div>
                      <div className="text-muted-foreground">{error.reason}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(error.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Breakdown */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Action Breakdown (Last 50)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(stats.byAction).map(([action, count]) => (
              <div key={action} className="flex items-center justify-between bg-muted rounded p-2 text-sm">
                <span className="capitalize text-muted-foreground">{action}</span>
                <span className="font-semibold text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
