import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Play, Pencil, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useWcFeatureFlags, useUpdateWcFeatureFlag, useInvokeWcFunction,
  useWcFeaturedTeams, useUpsertWcFeaturedTeam, useDeleteWcFeaturedTeam,
  useWcTeamMappings, useUpsertWcTeamMapping, useDeleteWcTeamMapping,
} from '@/hooks/wc/useWorldCup';
import type { WcFeaturedTeam, WcTeamMapping, WcFunctionName } from '@/types/worldcup';

const TOGGLE_FLAGS = [
  'scheduler_enabled',
  'friendlies_sync_enabled',
  'dry_run_mode',
  'iraq_safety_net_enabled',
  'iraq_eliminated',
  'wc_congrats_notifications_enabled',
];

const ACTIONS: { name: WcFunctionName; label: string }[] = [
  { name: 'sync-worldcup-data', label: 'Sync WC fixtures' },
  { name: 'sync-worldcup-friendlies', label: 'Sync pre-WC friendlies' },
  { name: 'braze-worldcup-scheduler', label: 'Run scheduler' },
  { name: 'braze-worldcup-reconcile', label: 'Run reconciler' },
  { name: 'gap-detection-worldcup', label: 'Run gap detection' },
  { name: 'pre-send-verification-worldcup', label: 'Pre-send verification' },
];

export default function WcAdmin() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Operations Panel</h1>
        <p className="text-muted-foreground text-sm">World Cup scheduler controls</p>
      </div>
      <FeatureFlagsCard />
      <ActionsCard />
      <FeaturedTeamsCard />
      <TeamMappingsCard />
    </div>
  );
}

function FeatureFlagsCard() {
  const { data: flags, isLoading } = useWcFeatureFlags();
  const update = useUpdateWcFeatureFlag();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature flags</CardTitle>
        <CardDescription>Master switches for the WC scheduler</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {TOGGLE_FLAGS.map((key) => {
          const flag = flags?.find((f) => f.key === key);
          if (!flag) return null;
          return (
            <div key={key} className="flex items-center justify-between border-b border-border/50 pb-3">
              <div>
                <Label className="text-base">{key}</Label>
                {flag.description && <p className="text-xs text-muted-foreground">{flag.description}</p>}
              </div>
              <Switch
                checked={flag.enabled}
                disabled={update.isPending}
                onCheckedChange={async (v) => {
                  try {
                    await update.mutateAsync({ key, enabled: v });
                    toast.success(`${key} → ${v ? 'on' : 'off'}`);
                  } catch (e: any) { toast.error(e.message); }
                }}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ActionsCard() {
  const invoke = useInvokeWcFunction();
  const [running, setRunning] = useState<string | null>(null);

  const run = async (name: WcFunctionName) => {
    setRunning(name);
    try {
      const data = await invoke.mutateAsync({ name });
      toast.success(`${name} OK`, { description: JSON.stringify(data).slice(0, 200) });
    } catch (e: any) {
      toast.error(`${name} failed`, { description: e.message });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>Manually invoke a WC edge function</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {ACTIONS.map((a) => (
          <Button key={a.name} variant="outline" onClick={() => run(a.name)} disabled={running === a.name}>
            {running === a.name ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {a.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function FeaturedTeamsCard() {
  const { data: teams, isLoading } = useWcFeaturedTeams();
  const upsert = useUpsertWcFeaturedTeam();
  const del = useDeleteWcFeaturedTeam();
  const [editing, setEditing] = useState<Partial<WcFeaturedTeam> | null>(null);
  const [open, setOpen] = useState(false);

  const openNew = () => { setEditing({ enabled: true }); setOpen(true); };
  const openEdit = (t: WcFeaturedTeam) => { setEditing(t); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    try {
      await upsert.mutateAsync(editing);
      toast.success('Saved');
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Featured teams</CardTitle>
          <CardDescription>12 nations targeted by the WC scheduler</CardDescription>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Canonical</TableHead><TableHead>ISO</TableHead><TableHead>EN</TableHead>
              <TableHead>AR</TableHead><TableHead>Braze attr</TableHead><TableHead>Priority</TableHead>
              <TableHead>Enabled</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {teams?.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.canonical_name}</TableCell>
                  <TableCell>{t.iso_code}</TableCell>
                  <TableCell>{t.display_name_en}</TableCell>
                  <TableCell dir="rtl">{t.display_name_ar}</TableCell>
                  <TableCell className="font-mono text-xs">{t.braze_attribute_value}</TableCell>
                  <TableCell>{t.priority_flag ? <Badge>{t.priority_flag}</Badge> : '—'}</TableCell>
                  <TableCell>{t.enabled ? <Badge variant="secondary">on</Badge> : <Badge variant="outline">off</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm(`Delete ${t.canonical_name}?`)) return;
                      await del.mutateAsync(t.id); toast.success('Deleted');
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit team' : 'Add team'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              ['canonical_name', 'Canonical name'],
              ['iso_code', 'ISO code'],
              ['display_name_en', 'Display name (EN)'],
              ['display_name_ar', 'Display name (AR)'],
              ['braze_attribute_value', 'Braze attribute value'],
              ['priority_flag', 'Priority flag (optional)'],
            ].map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  value={(editing as any)?.[key] || ''}
                  onChange={(e) => setEditing({ ...editing!, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Switch checked={!!editing?.enabled} onCheckedChange={(v) => setEditing({ ...editing!, enabled: v })} />
              <Label>Enabled</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TeamMappingsCard() {
  const { data: mappings, isLoading } = useWcTeamMappings();
  const { data: teams } = useWcFeaturedTeams();
  const upsert = useUpsertWcTeamMapping();
  const del = useDeleteWcTeamMapping();
  const [editing, setEditing] = useState<Partial<WcTeamMapping> | null>(null);
  const [open, setOpen] = useState(false);

  const teamName = (id: string) => teams?.find((t) => t.id === id)?.canonical_name || id;

  const save = async () => {
    if (!editing) return;
    try {
      const payload: any = { ...editing };
      if (payload.football_data_id !== undefined && payload.football_data_id !== null && payload.football_data_id !== '') {
        payload.football_data_id = Number(payload.football_data_id);
      } else {
        payload.football_data_id = null;
      }
      await upsert.mutateAsync(payload);
      toast.success('Saved');
      setOpen(false);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team mappings</CardTitle>
          <CardDescription>Football Data API name → canonical featured team</CardDescription>
        </div>
        <Button size="sm" onClick={() => { setEditing({}); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Featured team</TableHead><TableHead>FD name</TableHead>
              <TableHead>FD id</TableHead><TableHead>Pattern</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {mappings?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{teamName(m.featured_team_id)}</TableCell>
                  <TableCell>{m.football_data_name}</TableCell>
                  <TableCell className="font-mono text-xs">{m.football_data_id ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{m.match_pattern || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm('Delete mapping?')) return;
                      await del.mutateAsync(m.id); toast.success('Deleted');
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit mapping' : 'Add mapping'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Featured team</Label>
              <Select
                value={editing?.featured_team_id || ''}
                onValueChange={(v) => setEditing({ ...editing!, featured_team_id: v })}
              >
                <SelectTrigger><SelectValue placeholder="Pick team" /></SelectTrigger>
                <SelectContent>
                  {teams?.map((t) => <SelectItem key={t.id} value={t.id}>{t.canonical_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Football Data name</Label>
              <Input value={editing?.football_data_name || ''} onChange={(e) => setEditing({ ...editing!, football_data_name: e.target.value })} />
            </div>
            <div>
              <Label>Football Data id (optional)</Label>
              <Input
                type="number"
                value={editing?.football_data_id ?? ''}
                onChange={(e) => setEditing({ ...editing!, football_data_id: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Match pattern (optional)</Label>
              <Input value={editing?.match_pattern || ''} onChange={(e) => setEditing({ ...editing!, match_pattern: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
