import type { WcAnalyticsBundle } from '@/hooks/wc/useWorldCup';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export function WcSchedulerHealthSection({ data }: { data: WcAnalyticsBundle }) {
  const { ledgerDuplicates, stalePending, recentErrors } = data.schedulerHealth;
  const ok = ledgerDuplicates.length === 0 && stalePending.length === 0 && recentErrors.length === 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <HealthKpi label="Gap alerts" value={data.gapAlerts} bad={data.gapAlerts > 0} />
        <HealthKpi label="Ledger duplicates" value={ledgerDuplicates.length} bad={ledgerDuplicates.length > 0} />
        <HealthKpi label="Stale pending" value={stalePending.length} bad={stalePending.length > 0} />
        <HealthKpi label="Recent errors" value={recentErrors.length} bad={recentErrors.length > 0} />
      </div>

      {ok && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto text-primary mb-3" />
            All clear — no scheduler issues in range.
          </CardContent>
        </Card>
      )}

      {ledgerDuplicates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ledger duplicates</CardTitle>
            <CardDescription>Matches with multiple ledger rows. Investigate before sending.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Match</TableHead><TableHead className="text-right">Schedule count</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {ledgerDuplicates.map((d) => (
                  <TableRow key={d.matchId}>
                    <TableCell>{d.matchLabel}</TableCell>
                    <TableCell className="text-right"><Badge variant="destructive">{d.count}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {stalePending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stale pending schedules</CardTitle>
            <CardDescription>Queued but past their scheduled send time.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Match</TableHead><TableHead>Scheduled (UTC)</TableHead><TableHead>Created</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {stalePending.map((s) => (
                  <TableRow key={s.matchId + s.sendAtUtc}>
                    <TableCell>{s.matchLabel}</TableCell>
                    <TableCell className="font-mono text-xs">{format(new Date(s.sendAtUtc), 'MMM dd HH:mm')}</TableCell>
                    <TableCell className="font-mono text-xs">{format(new Date(s.createdAt), 'MMM dd HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent edge-function errors</CardTitle>
            <CardDescription>Last {recentErrors.length} error-level entries from scheduler logs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Time</TableHead><TableHead>Function</TableHead><TableHead>Message</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {recentErrors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{format(new Date(e.createdAt), 'MMM dd HH:mm:ss')}</TableCell>
                    <TableCell className="text-xs">{e.functionName}</TableCell>
                    <TableCell className="text-xs text-destructive">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HealthKpi({ label, value, bad }: { label: string; value: number; bad: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 text-xs ${bad ? 'text-destructive' : 'text-muted-foreground'}`}>
          {bad ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {label}
        </div>
        <div className="text-2xl font-bold mt-1.5">{value}</div>
      </CardContent>
    </Card>
  );
}
