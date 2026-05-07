import { useState, Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useWcSchedulerLogs } from '@/hooks/wc/useWorldCup';
import { WC_FUNCTION_NAMES } from '@/types/worldcup';
import { format } from 'date-fns';

export default function WcLogs() {
  const [level, setLevel] = useState('all');
  const [fn, setFn] = useState<string>('all');
  const [hours, setHours] = useState('24');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useWcSchedulerLogs({
    level, functionName: fn, hours: Number(hours), page, pageSize: 50,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Notification logs</h1>
        <p className="text-muted-foreground text-sm">Live tail of wc_scheduler_logs (5s refresh)</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <Label className="text-xs">Level</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Function</Label>
            <Select value={fn} onValueChange={setFn}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {WC_FUNCTION_NAMES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Time range</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last hour</SelectItem>
                <SelectItem value="6">Last 6h</SelectItem>
                <SelectItem value="24">Last 24h</SelectItem>
                <SelectItem value="168">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">{data?.total ?? 0} total</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-10 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Function</TableHead>
                <TableHead>Message</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No logs</TableCell></TableRow>
                )}
                {data?.rows.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                      <TableCell>{expanded === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-mono text-xs">{format(new Date(log.created_at), 'MMM dd HH:mm:ss')}</TableCell>
                      <TableCell>
                        <Badge variant={log.log_level === 'error' ? 'destructive' : log.log_level === 'warn' ? 'secondary' : 'outline'}>
                          {log.log_level}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.function_name}</TableCell>
                      <TableCell className="text-sm">{log.message || '—'}</TableCell>
                    </TableRow>
                    {expanded === log.id && (
                      <TableRow><TableCell colSpan={5} className="bg-muted/30">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap p-2">
                          {JSON.stringify(log.context ?? {}, null, 2)}
                        </pre>
                      </TableCell></TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <div className="text-xs text-muted-foreground">Page {page + 1}</div>
        <Button variant="outline" size="sm" disabled={(data?.rows.length || 0) < 50} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
