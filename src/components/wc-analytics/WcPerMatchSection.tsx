import type { WcAnalyticsBundle, WcMatchAnalytics } from '@/hooks/wc/useWorldCup';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, CheckCircle2, Clock, XCircle, AlertTriangle, MinusCircle } from 'lucide-react';
import { format } from 'date-fns';
import { STAGE_LABELS, downloadCsv } from './shared';

const healthBadge = (h: WcMatchAnalytics['health']) => {
  switch (h) {
    case 'ok': return <Badge variant="outline" className="border-primary text-primary">OK</Badge>;
    case 'missing-pregame': return <Badge variant="destructive">Missing pre-game</Badge>;
    case 'missing-congrats': return <Badge variant="destructive">Missing congrats</Badge>;
    case 'duplicate': return <Badge variant="destructive">Duplicate</Badge>;
    case 'error': return <Badge variant="destructive">Error</Badge>;
  }
};

const pgIcon = (s: WcMatchAnalytics['preGameStatus']) => {
  if (s === 'none') return <MinusCircle className="h-4 w-4 text-muted-foreground inline" />;
  if (s === 'queued') return <Clock className="h-4 w-4 text-yellow-500 inline" />;
  if (s === 'error') return <XCircle className="h-4 w-4 text-destructive inline" />;
  return <CheckCircle2 className="h-4 w-4 text-primary inline" />;
};

const cgIcon = (s: WcMatchAnalytics['congratsStatus']) => {
  if (s === 'none' || s === 'pending') return <MinusCircle className="h-4 w-4 text-muted-foreground inline" />;
  if (s === 'skipped' || s === 'dry_run') return <MinusCircle className="h-4 w-4 text-muted-foreground inline" />;
  if (s === 'error') return <XCircle className="h-4 w-4 text-destructive inline" />;
  return <CheckCircle2 className="h-4 w-4 text-primary inline" />;
};

export function WcPerMatchSection({ data }: { data: WcAnalyticsBundle }) {
  const rows = data.perMatch;

  const exportRows = rows.map((r) => ({
    kickoff_utc: r.kickoffUtc,
    home: r.homeTeam,
    away: r.awayTeam,
    stage: STAGE_LABELS[r.stage] || r.stage,
    group: r.group,
    status: r.status,
    score: r.scoreHome != null ? `${r.scoreHome}-${r.scoreAway}` : '',
    pre_game_status: r.preGameStatus,
    pre_game_targets: r.preGameTargets.join('|'),
    pre_game_send_at: r.preGameSendAt,
    pre_game_dispatch_id: r.preGameDispatchId,
    congrats_status: r.congratsStatus,
    congrats_winner: r.congratsWinner,
    congrats_dispatch_id: r.congratsDispatchId,
    health: r.health,
  }));

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No matches in this date range.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold">Per-match breakdown</h3>
          <p className="text-xs text-muted-foreground">{rows.length} matches in range · click a row to see Braze IDs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadCsv('wc-per-match.csv', exportRows)}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Kickoff (UTC)</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-center">Pre-game</TableHead>
              <TableHead>Target(s)</TableHead>
              <TableHead className="text-center">Congrats</TableHead>
              <TableHead>Winner</TableHead>
              <TableHead>Health</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.matchId} className="text-sm">
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {format(new Date(r.kickoffUtc), 'MMM dd HH:mm')}
                </TableCell>
                <TableCell className="font-medium">
                  {r.homeTeam} <span className="text-muted-foreground">vs</span> {r.awayTeam}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{STAGE_LABELS[r.stage] || r.stage}</span>
                  {r.group && <span className="text-xs text-muted-foreground"> · {r.group}</span>}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.scoreHome != null ? `${r.scoreHome}-${r.scoreAway}` : '—'}
                </TableCell>
                <TableCell className="text-center" title={r.preGameStatus}>
                  {pgIcon(r.preGameStatus)} <span className="text-xs text-muted-foreground capitalize ml-1">{r.preGameStatus.replace('_', ' ')}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.preGameTargets.length === 0 ? '—' : r.preGameTargets.join(', ')}
                </TableCell>
                <TableCell className="text-center" title={r.congratsStatus}>
                  {cgIcon(r.congratsStatus)} <span className="text-xs text-muted-foreground capitalize ml-1">{r.congratsStatus.replace('_', ' ')}</span>
                </TableCell>
                <TableCell className="text-xs">
                  {r.congratsWinner || (r.scoreHome != null && r.scoreAway != null && r.scoreHome === r.scoreAway ? <span className="text-muted-foreground">draw</span> : '—')}
                </TableCell>
                <TableCell>{healthBadge(r.health)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
