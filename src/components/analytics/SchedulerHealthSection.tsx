import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Server, ShieldCheck, Clock, Layers } from "lucide-react";

interface StalePendingMatch {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  sendAtUtc: string;
  createdAt: string;
}

interface LedgerDuplicateDetail {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  scheduleCount: number;
}

export interface SchedulerHealthData {
  avgDeliveryBatches: number;
  scheduleLedgerDuplicates: number;
  stalePendingCount: number;
  stalePendingMatches: StalePendingMatch[];
  webhookDuplicatesSkipped: number;
  ledgerDuplicateDetails: LedgerDuplicateDetail[];
}

interface SchedulerHealthSectionProps {
  data: SchedulerHealthData;
}

export function SchedulerHealthSection({ data }: SchedulerHealthSectionProps) {
  const hasIssues = data.scheduleLedgerDuplicates > 0 || data.stalePendingCount > 0;
  const hasLedgerDuplicates = data.ledgerDuplicateDetails && data.ledgerDuplicateDetails.length > 0;
  const hasStalePending = data.stalePendingMatches && data.stalePendingMatches.length > 0;

  return (
    <div className="space-y-6">
      {/* Health Status Alert */}
      {hasIssues ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Scheduler Anomaly Detected</AlertTitle>
          <AlertDescription>
            {data.scheduleLedgerDuplicates > 0 && (
              <span>{data.scheduleLedgerDuplicates} match(es) have duplicate schedule entries. </span>
            )}
            {data.stalePendingCount > 0 && (
              <span>{data.stalePendingCount} schedule(s) are past kickoff but still pending — delivery may not have been confirmed. </span>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-500">Scheduler Healthy</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            No duplicate schedules or stale pending entries detected.
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
            <CardTitle className="text-sm font-medium">Stale Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{data.stalePendingCount}</div>
              <Badge variant={data.stalePendingCount === 0 ? "outline" : "destructive"}>
                {data.stalePendingCount === 0 ? "Clean" : "Action Needed"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Past-kickoff schedules with no delivery confirmation
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Delivery Batches</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{data.avgDeliveryBatches}</div>
              <Badge variant="outline">Info</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Braze batches per match (normal batching behavior)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Stale Pending Table */}
      {hasStalePending && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-destructive" />
              Stale Pending Schedules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match ID</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Scheduled Send</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.stalePendingMatches.map((match) => (
                  <TableRow key={match.matchId}>
                    <TableCell className="font-mono text-sm">{match.matchId}</TableCell>
                    <TableCell>{match.homeTeam} vs {match.awayTeam}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(match.sendAtUtc).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">Stale Pending</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Ledger Duplicates Table */}
      {hasLedgerDuplicates && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Ledger Duplicate Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Match ID</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-center">Ledger Entries</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.ledgerDuplicateDetails.map((detail) => (
                  <TableRow key={detail.matchId}>
                    <TableCell className="font-mono text-sm">{detail.matchId}</TableCell>
                    <TableCell>{detail.homeTeam} vs {detail.awayTeam}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="destructive">{detail.scheduleCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">Duplicate Risk</Badge>
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
            <strong>Stale Pending:</strong> Schedules that are past their send time but haven't received a 
            delivery confirmation webhook. This may indicate the notification was never sent, or the webhook was lost.
          </p>
          <p>
            <strong>Ledger Duplicates:</strong> The schedule_ledger should have exactly one entry per match. 
            Multiple entries indicate the scheduler ran multiple times without proper deduplication.
          </p>
          <p>
            <strong>Webhook Duplicates Blocked:</strong> Shows how many redundant webhook calls were 
            prevented from creating duplicate log entries, protecting analytics accuracy.
          </p>
          <p>
            <strong>Avg Delivery Batches:</strong> Braze splits large audiences into internal delivery batches, 
            each with its own dispatch_id. Multiple batches per match is normal behavior, not an anomaly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
