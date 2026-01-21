import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Activity, Server, Layers, ShieldCheck } from "lucide-react";

interface SchedulerHealthData {
  matchesWithMultipleDispatchIds: number;
  avgDispatchIdsPerMatch: number;
  scheduleLedgerDuplicates: number;
  webhookDuplicatesSkipped: number;
  topAnomalies: {
    matchId: number;
    homeTeam: string;
    awayTeam: string;
    dispatchIdCount: number;
    scheduleCount: number;
  }[];
}

interface SchedulerHealthSectionProps {
  data: SchedulerHealthData;
}

export function SchedulerHealthSection({ data }: SchedulerHealthSectionProps) {
  const hasIssues = data.matchesWithMultipleDispatchIds > 0 || data.scheduleLedgerDuplicates > 0;
  const hasAnomalies = data.topAnomalies && data.topAnomalies.length > 0;

  return (
    <div className="space-y-6">
      {/* Health Status Alert */}
      {hasIssues ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Scheduler Anomaly Detected</AlertTitle>
          <AlertDescription>
            {data.matchesWithMultipleDispatchIds > 0 && (
              <span>{data.matchesWithMultipleDispatchIds} match(es) have multiple dispatch IDs. </span>
            )}
            {data.scheduleLedgerDuplicates > 0 && (
              <span>{data.scheduleLedgerDuplicates} match(es) have duplicate schedule entries. </span>
            )}
            This may indicate the scheduler created duplicate notifications.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-500">Scheduler Healthy</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            No duplicate schedules or dispatch ID anomalies detected in this period.
            {data.webhookDuplicatesSkipped > 0 && (
              <span className="ml-1">
                {data.webhookDuplicatesSkipped.toLocaleString()} webhook duplicates were blocked by deduplication.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Multi-Dispatch Matches</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{data.matchesWithMultipleDispatchIds}</div>
              <Badge variant={data.matchesWithMultipleDispatchIds === 0 ? "outline" : "destructive"}>
                {data.matchesWithMultipleDispatchIds === 0 ? "Clean" : "Anomaly"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Matches with multiple dispatch_ids (should be 0)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Dispatch IDs/Match</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{data.avgDispatchIdsPerMatch}</div>
              <Badge variant={data.avgDispatchIdsPerMatch <= 1.1 ? "outline" : "secondary"}>
                {data.avgDispatchIdsPerMatch <= 1 ? "Optimal" : data.avgDispatchIdsPerMatch <= 1.1 ? "Good" : "Review"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Expected: ~1 (one dispatch per match)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ledger Duplicates</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{data.scheduleLedgerDuplicates}</div>
              <Badge variant={data.scheduleLedgerDuplicates === 0 ? "outline" : "destructive"}>
                {data.scheduleLedgerDuplicates === 0 ? "Clean" : "Duplicates"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Matches with multiple schedule_ledger entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Webhook Duplicates Blocked</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{data.webhookDuplicatesSkipped.toLocaleString()}</div>
              <Badge variant="outline">Protected</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Duplicate webhook events prevented from logging
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Anomalies Table */}
      {hasAnomalies && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Anomaly Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match ID</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-center">Dispatch IDs</TableHead>
                  <TableHead className="text-center">Ledger Entries</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topAnomalies.map((anomaly) => (
                  <TableRow key={anomaly.matchId}>
                    <TableCell className="font-mono text-sm">{anomaly.matchId}</TableCell>
                    <TableCell>
                      {anomaly.homeTeam || 'N/A'} vs {anomaly.awayTeam || 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={anomaly.dispatchIdCount > 1 ? "destructive" : "outline"}>
                        {anomaly.dispatchIdCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={anomaly.scheduleCount > 1 ? "destructive" : "outline"}>
                        {anomaly.scheduleCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {anomaly.dispatchIdCount > 1 || anomaly.scheduleCount > 1 ? (
                        <Badge variant="destructive">Duplicate Risk</Badge>
                      ) : (
                        <Badge variant="outline">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Explanation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Understanding Scheduler Health Metrics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Multi-Dispatch Matches:</strong> When a match has multiple dispatch_ids, it means Braze 
            received multiple schedule requests for the same match, potentially causing duplicate notifications.
          </p>
          <p>
            <strong>Ledger Duplicates:</strong> The schedule_ledger should have exactly one entry per match. 
            Multiple entries indicate the scheduler ran multiple times without proper deduplication.
          </p>
          <p>
            <strong>Webhook Duplicates Blocked:</strong> This shows how many redundant webhook calls were 
            prevented from creating duplicate log entries, protecting analytics accuracy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
