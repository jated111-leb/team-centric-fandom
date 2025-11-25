import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';

interface Gap {
  match_id: number;
  home_team: string;
  away_team: string;
  competition: string;
  kickoff_utc: string;
  hours_until_kickoff: number;
  featured_teams: string[];
}

export function GapDetectionAlert() {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    runGapDetection();
    // Auto-refresh every 5 minutes
    const interval = setInterval(runGapDetection, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const runGapDetection = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('gap-detection', {
        body: {},
      });

      if (response.error) throw response.error;

      setGaps(response.data.gaps || []);
      setLastScan(new Date());
    } catch (error) {
      console.error('Error running gap detection:', error);
      toast({
        title: 'Gap Detection Failed',
        description: error instanceof Error ? error.message : 'Failed to scan for gaps',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatKickoff = (utcDate: string) => {
    return formatInTimeZone(new Date(utcDate), 'Asia/Baghdad', 'MMM dd, yyyy HH:mm');
  };

  if (gaps.length === 0 && !loading) {
    return (
      <Card className="border-success/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <CardTitle>Gap Detection</CardTitle>
            </div>
            <Button
              onClick={runGapDetection}
              disabled={loading}
              variant="ghost"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <CardDescription>
            No missing schedules detected for featured team matches in the next 48 hours
          </CardDescription>
        </CardHeader>
        {lastScan && (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Last scan: {lastScan.toLocaleTimeString()}
            </p>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Missing Schedules Detected</CardTitle>
          </div>
          <Button
            onClick={runGapDetection}
            disabled={loading}
            variant="ghost"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <CardDescription>
          {gaps.length} featured team {gaps.length === 1 ? 'match' : 'matches'} in the next 48 hours without scheduled notifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gaps.map((gap) => (
            <div
              key={gap.match_id}
              className="rounded-lg border border-border bg-muted/50 p-3 space-y-2"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">
                    {gap.home_team} vs {gap.away_team}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {gap.competition} • {formatKickoff(gap.kickoff_utc)} (Baghdad)
                  </p>
                </div>
                <Badge variant="destructive" className="text-xs">
                  {gap.hours_until_kickoff.toFixed(1)}h
                </Badge>
              </div>
              <div className="flex gap-1 flex-wrap">
                {gap.featured_teams.map((team) => (
                  <Badge key={team} variant="secondary" className="text-xs">
                    {team}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {lastScan && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Last scan: {lastScan.toLocaleTimeString()} • Auto-refreshes every 5 minutes
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
