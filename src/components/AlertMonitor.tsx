import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, XCircle, RefreshCw, CheckCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface SchedulerLog {
  id: string;
  function_name: string;
  match_id: number | null;
  action: string;
  reason: string | null;
  details: any;
  created_at: string;
}

interface TimingIssue {
  match_id: number;
  scheduled_time: string;
  kickoff_time: string;
  minutes_before: number;
  issue: string;
}

interface StalePendingSchedule {
  match_id: number;
  schedule_id: string;
  send_at_utc: string;
  home_team: string;
  away_team: string;
  hours_overdue: number;
}

interface MissingSchedule {
  match_id: number;
  schedule_id: string;
  send_at_utc: string;
  home_team: string;
  away_team: string;
  hours_until_send: number;
}

export function AlertMonitor() {
  const [errors, setErrors] = useState<SchedulerLog[]>([]);
  const [timingIssues, setTimingIssues] = useState<TimingIssue[]>([]);
  const [stalePending, setStalePending] = useState<StalePendingSchedule[]>([]);
  const [missingSchedules, setMissingSchedules] = useState<MissingSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date>(new Date());

  useEffect(() => {
    checkForIssues();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(checkForIssues, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkForIssues = async () => {
    setLoading(true);
    try {
      await Promise.all([
        checkRecentErrors(),
        checkTimingIssues(),
        checkStalePending(),
      ]);
      setLastCheck(new Date());
    } catch (error) {
      console.error('Error checking issues:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkRecentErrors = async () => {
    // Get errors from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { data, error } = await supabase
      .from('scheduler_logs')
      .select('*')
      .eq('action', 'error')
      .gte('created_at', twentyFourHoursAgo.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching errors:', error);
      return;
    }

    setErrors(data || []);
  };

  const checkTimingIssues = async () => {
    // Get all scheduled notifications from ledger
    const now = new Date();
    const { data: schedules, error: scheduleError } = await supabase
      .from('schedule_ledger')
      .select('match_id, send_at_utc')
      .eq('status', 'pending')
      .gte('send_at_utc', now.toISOString());

    if (scheduleError || !schedules) return;

    // Get corresponding match data
    const matchIds = schedules.map(s => s.match_id);
    if (matchIds.length === 0) {
      setTimingIssues([]);
      return;
    }

    const { data: matches, error: matchError } = await supabase
      .from('matches')
      .select('id, utc_date, home_team, away_team')
      .in('id', matchIds);

    if (matchError || !matches) return;

    // Check for timing issues
    const issues: TimingIssue[] = [];
    
    for (const schedule of schedules) {
      const match = matches.find(m => m.id === schedule.match_id);
      if (!match) continue;

      const kickoffTime = new Date(match.utc_date);
      const scheduledTime = new Date(schedule.send_at_utc);
      const minutesBefore = (kickoffTime.getTime() - scheduledTime.getTime()) / (60 * 1000);

      // Flag if notification is scheduled outside 55-65 minute window
      if (minutesBefore < 55 || minutesBefore > 65) {
        issues.push({
          match_id: schedule.match_id,
          scheduled_time: schedule.send_at_utc,
          kickoff_time: match.utc_date,
          minutes_before: Math.round(minutesBefore),
          issue: minutesBefore < 55 
            ? `Too close to kickoff (${Math.round(minutesBefore)} min)` 
            : `Too far from kickoff (${Math.round(minutesBefore)} min)`,
        });
      }
    }

    setTimingIssues(issues);
  };

  const checkStalePending = async () => {
    // Find schedules where send_at_utc has passed but status is still pending
    const now = new Date();
    
    const { data: staleSchedules, error } = await supabase
      .from('schedule_ledger')
      .select('match_id, braze_schedule_id, send_at_utc, status')
      .eq('status', 'pending')
      .lt('send_at_utc', now.toISOString());

    if (error || !staleSchedules) {
      console.error('Error fetching stale schedules:', error);
      return;
    }

    if (staleSchedules.length === 0) {
      setStalePending([]);
      return;
    }

    // Get match details
    const matchIds = staleSchedules.map(s => s.match_id);
    const { data: matches } = await supabase
      .from('matches')
      .select('id, home_team, away_team')
      .in('id', matchIds);

    // Check if notification_sends exists for these matches
    const { data: sends } = await supabase
      .from('notification_sends')
      .select('match_id')
      .in('match_id', matchIds);

    const sendsSet = new Set(sends?.map(s => s.match_id) || []);

    const stale: StalePendingSchedule[] = [];
    for (const schedule of staleSchedules) {
      // Only flag if no webhook was received
      if (!sendsSet.has(schedule.match_id)) {
        const match = matches?.find(m => m.id === schedule.match_id);
        const sendAtDate = new Date(schedule.send_at_utc);
        const hoursOverdue = Math.round((now.getTime() - sendAtDate.getTime()) / (60 * 60 * 1000));
        
        stale.push({
          match_id: schedule.match_id,
          schedule_id: schedule.braze_schedule_id,
          send_at_utc: schedule.send_at_utc,
          home_team: match?.home_team || 'Unknown',
          away_team: match?.away_team || 'Unknown',
          hours_overdue: hoursOverdue,
        });
      }
    }

    setStalePending(stale);
  };

  const runVerification = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-braze-schedules');
      
      if (error) {
        toast.error('Verification failed', { description: error.message });
        return;
      }

      // Update missing schedules from verification result
      if (data?.alerts?.missing_from_braze) {
        const now = new Date();
        const missing = data.alerts.missing_from_braze.map((s: any) => ({
          match_id: s.match_id,
          schedule_id: s.schedule_id,
          send_at_utc: s.send_at_utc,
          home_team: s.home_team,
          away_team: s.away_team,
          hours_until_send: Math.round((new Date(s.send_at_utc).getTime() - now.getTime()) / (60 * 60 * 1000)),
        }));
        setMissingSchedules(missing);
      }

      toast.success('Verification complete', {
        description: `Verified: ${data.summary?.verified_in_braze || 0}, Missing: ${data.summary?.missing_from_braze || 0}, Stale: ${data.summary?.past_no_webhook || 0}`,
      });

      // Refresh all data
      await checkForIssues();
    } catch (error) {
      toast.error('Verification failed', { description: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setVerifying(false);
    }
  };

  const hasIssues = errors.length > 0 || timingIssues.length > 0 || stalePending.length > 0 || missingSchedules.length > 0;
  const hasCritical = stalePending.length > 0 || missingSchedules.length > 0;

  return (
    <CollapsibleCard
      className={hasCritical ? 'border-destructive border-2' : hasIssues ? 'border-destructive' : 'border-border'}
      title={
        <div className="flex items-center gap-2">
          {hasCritical ? (
            <ShieldAlert className="h-5 w-5 text-destructive animate-pulse" />
          ) : hasIssues ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <CheckCircle className="h-5 w-5 text-green-500" />
          )}
          <span>System Alerts</span>
        </div>
      }
      description={`Monitoring scheduler errors, timing issues, and missed notifications (Last checked: ${lastCheck.toLocaleTimeString()})`}
      headerExtra={
        <div className="flex gap-2">
          <Button
            onClick={runVerification}
            disabled={loading || verifying}
            size="sm"
            variant="outline"
          >
            <ShieldAlert className={`h-4 w-4 mr-2 ${verifying ? 'animate-spin' : ''}`} />
            Verify
          </Button>
          <Button
            onClick={checkForIssues}
            disabled={loading || verifying}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
      defaultOpen={true}
    >
      <div className="space-y-4">
        {!hasIssues && !loading && (
          <Alert className="border-green-500/20 bg-green-500/10">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-700 dark:text-green-400">All Systems Operational</AlertTitle>
            <AlertDescription className="text-green-600 dark:text-green-300">
              No errors, timing issues, or missed notifications detected.
            </AlertDescription>
          </Alert>
        )}

        {/* CRITICAL: Stale Pending (Missed Notifications) */}
        {stalePending.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <h3 className="font-semibold text-sm text-destructive">
                CRITICAL: Missed Notifications ({stalePending.length})
              </h3>
            </div>
            <div className="space-y-2">
              {stalePending.map((schedule, idx) => (
                <Alert key={idx} variant="destructive" className="border-2">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle className="text-sm">
                    Match #{schedule.match_id} - {schedule.home_team} vs {schedule.away_team}
                  </AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <div className="font-medium text-destructive">
                      No webhook received - notification may not have been sent!
                    </div>
                    <div>
                      <span className="font-medium">Schedule ID:</span> {schedule.schedule_id}
                    </div>
                    <div>
                      <span className="font-medium">Was scheduled for:</span> {new Date(schedule.send_at_utc).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Overdue by:</span> {schedule.hours_overdue} hours
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </div>
        )}

        {/* Missing from Braze (Future schedules) */}
        {missingSchedules.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h3 className="font-semibold text-sm text-destructive">
                Missing from Braze ({missingSchedules.length})
              </h3>
            </div>
            <div className="space-y-2">
              {missingSchedules.slice(0, 5).map((schedule, idx) => (
                <Alert key={idx} variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm">
                    Match #{schedule.match_id} - {schedule.home_team} vs {schedule.away_team}
                  </AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <div className="font-medium">
                      Schedule exists in ledger but NOT in Braze!
                    </div>
                    <div>
                      <span className="font-medium">Scheduled for:</span> {new Date(schedule.send_at_utc).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Time until send:</span> {schedule.hours_until_send} hours
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              {missingSchedules.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  And {missingSchedules.length - 5} more missing schedules...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Timing Issues */}
        {timingIssues.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-destructive" />
              <h3 className="font-semibold text-sm text-foreground">
                Timing Issues ({timingIssues.length})
              </h3>
            </div>
            <div className="space-y-2">
              {timingIssues.slice(0, 5).map((issue, idx) => (
                <Alert key={idx} variant="destructive">
                  <Clock className="h-4 w-4" />
                  <AlertTitle className="text-sm">
                    Match #{issue.match_id} - {issue.issue}
                  </AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <div>
                      <span className="font-medium">Expected:</span> 60 minutes before kickoff
                    </div>
                    <div>
                      <span className="font-medium">Actual:</span> {issue.minutes_before} minutes before
                    </div>
                    <div className="text-muted-foreground">
                      Scheduled: {new Date(issue.scheduled_time).toLocaleString()}
                    </div>
                    <div className="text-muted-foreground">
                      Kickoff: {new Date(issue.kickoff_time).toLocaleString()}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              {timingIssues.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  And {timingIssues.length - 5} more timing issues...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Scheduler Errors */}
        {errors.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <h3 className="font-semibold text-sm text-foreground">
                Recent Errors ({errors.length})
              </h3>
            </div>
            <div className="space-y-2">
              {errors.slice(0, 5).map((error) => (
                <Alert key={error.id} variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {error.function_name}
                    </Badge>
                    {error.match_id && `Match #${error.match_id}`}
                  </AlertTitle>
                  <AlertDescription className="text-xs space-y-1">
                    <div className="font-medium">{error.reason}</div>
                    {error.details && (
                      <div className="text-muted-foreground">
                        {typeof error.details === 'string' 
                          ? error.details 
                          : JSON.stringify(error.details, null, 2)
                        }
                      </div>
                    )}
                    <div className="text-muted-foreground">
                      {new Date(error.created_at).toLocaleString()}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              {errors.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  And {errors.length - 5} more errors...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 pt-4 border-t border-border">
          <div className={`rounded-lg p-3 ${stalePending.length > 0 ? 'bg-destructive/20' : 'bg-muted'}`}>
            <div className={`text-2xl font-bold ${stalePending.length > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {stalePending.length}
            </div>
            <div className="text-xs text-muted-foreground">Missed</div>
          </div>
          <div className={`rounded-lg p-3 ${missingSchedules.length > 0 ? 'bg-destructive/20' : 'bg-muted'}`}>
            <div className={`text-2xl font-bold ${missingSchedules.length > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {missingSchedules.length}
            </div>
            <div className="text-xs text-muted-foreground">Missing</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-2xl font-bold text-destructive">
              {errors.length}
            </div>
            <div className="text-xs text-muted-foreground">Errors (24h)</div>
          </div>
          <div className="bg-muted rounded-lg p-3">
            <div className="text-2xl font-bold text-destructive">
              {timingIssues.length}
            </div>
            <div className="text-xs text-muted-foreground">Timing Issues</div>
          </div>
        </div>
      </div>
    </CollapsibleCard>
  );
}
