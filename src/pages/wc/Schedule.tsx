import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, RefreshCw, Trophy } from 'lucide-react';
import { useWcMatches, useWcLedgerCounts, useInvokeWcFunction } from '@/hooks/wc/useWorldCup';
import { formatBaghdadTime } from '@/lib/timezone';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function WcSchedule() {
  const matches = useWcMatches();
  const counts = useWcLedgerCounts();
  const invoke = useInvokeWcFunction();

  const [stage, setStage] = useState<string>('all');
  const [groupLetter, setGroupLetter] = useState<string>('all');
  const [featuredOnly, setFeaturedOnly] = useState(true);
  const [priority, setPriority] = useState<string>('all');
  const [search, setSearch] = useState('');

  const stages = useMemo(
    () => Array.from(new Set((matches.data || []).map((m) => m.stage))).sort(),
    [matches.data],
  );
  const groups = useMemo(
    () =>
      Array.from(
        new Set((matches.data || []).map((m) => m.group_letter).filter(Boolean) as string[]),
      ).sort(),
    [matches.data],
  );
  const priorities = useMemo(
    () =>
      Array.from(
        new Set((matches.data || []).map((m) => m.priority_flag).filter(Boolean) as string[]),
      ).sort(),
    [matches.data],
  );

  const filtered = useMemo(() => {
    return (matches.data || []).filter((m) => {
      if (stage !== 'all' && m.stage !== stage) return false;
      if (groupLetter !== 'all' && m.group_letter !== groupLetter) return false;
      if (featuredOnly && !m.featured_match) return false;
      if (priority !== 'all' && m.priority_flag !== priority) return false;
      if (
        search &&
        !`${m.home_team_canonical} ${m.away_team_canonical}`.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [matches.data, stage, groupLetter, featuredOnly, priority, search]);

  const handleReschedule = async (matchId: string) => {
    try {
      await invoke.mutateAsync({ name: 'braze-worldcup-scheduler', body: { match_id: matchId } });
      toast.success('Re-scheduled');
    } catch (e: any) {
      toast.error(e.message || 'Re-schedule failed');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">World Cup 2026 — Match Schedule</h1>
          <p className="text-muted-foreground text-sm">Upcoming fixtures for featured teams</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Search</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Team name..." />
          </div>
          <div>
            <Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {stages.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Group</Label>
            <Select value={groupLetter} onValueChange={setGroupLetter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {groups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {priorities.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 h-10">
            <Switch id="feat" checked={featuredOnly} onCheckedChange={setFeaturedOnly} />
            <Label htmlFor="feat">Featured only</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {matches.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kickoff (Baghdad)</TableHead>
                  <TableHead>UTC</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead>Sends</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">No matches</TableCell></TableRow>
                ) : filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{formatBaghdadTime(m.kickoff_utc, 'MMM dd HH:mm')}</TableCell>
                    <TableCell className="font-mono text-xs">{format(new Date(m.kickoff_utc), 'MMM dd HH:mm')}</TableCell>
                    <TableCell className="font-medium">{m.home_team_canonical} <span className="text-muted-foreground">v</span> {m.away_team_canonical}</TableCell>
                    <TableCell><Badge variant="outline">{m.stage}</Badge></TableCell>
                    <TableCell>{m.group_letter || '—'}</TableCell>
                    <TableCell>{m.priority_flag ? <Badge>{m.priority_flag}</Badge> : '—'}</TableCell>
                    <TableCell>{m.featured_match ? <Badge variant="secondary">Featured</Badge> : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{counts.data?.[m.id] || 0}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => handleReschedule(m.id)} disabled={invoke.isPending}>
                        <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        Re-schedule
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
