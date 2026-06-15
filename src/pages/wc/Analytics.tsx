import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useWcAnalytics, type WcAnalyticsGrain } from '@/hooks/wc/useWorldCup';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, RefreshCw, LayoutDashboard, Bell, Trophy, Calendar, Activity } from 'lucide-react';
import { WcExecutiveKPIs } from '@/components/wc-analytics/WcExecutiveKPIs';
import { WcOverviewSection } from '@/components/wc-analytics/WcOverviewSection';
import { WcPreGameSection } from '@/components/wc-analytics/WcPreGameSection';
import { WcPostGameSection } from '@/components/wc-analytics/WcPostGameSection';
import { WcPerMatchSection } from '@/components/wc-analytics/WcPerMatchSection';
import { WcSchedulerHealthSection } from '@/components/wc-analytics/WcSchedulerHealthSection';

const RANGES = [
  { v: '1', l: 'Last 24h' },
  { v: '7', l: 'Last 7 days' },
  { v: '14', l: 'Last 14 days' },
  { v: '30', l: 'Last 30 days' },
  { v: '90', l: 'Last 90 days' },
];

const GRAINS: { v: WcAnalyticsGrain; l: string }[] = [
  { v: 'day', l: 'Day' },
  { v: 'week', l: 'Week' },
  { v: 'month', l: 'Month' },
];

function autoGrain(days: number): WcAnalyticsGrain {
  if (days <= 14) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

export default function WcAnalytics() {
  const [days, setDays] = useState('7');
  const [grainOverride, setGrainOverride] = useState<WcAnalyticsGrain | 'auto'>('auto');
  const [syncing, setSyncing] = useState(false);
  const grain = grainOverride === 'auto' ? autoGrain(Number(days)) : grainOverride;
  const { data, isLoading } = useWcAnalytics(Number(days), grain);
  const qc = useQueryClient();

  async function syncNow() {
    setSyncing(true);
    try {
      const { data: res, error } = await supabase.functions.invoke('sync-wc-canvas-analytics');
      if (error) throw error;
      toast.success(`Synced ${res?.total_rows ?? 0} daily rows from Braze`);
      qc.invalidateQueries({ queryKey: ['wc_analytics_bundle'] });
    } catch (e: any) {
      toast.error(e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const effectiveGrainLabel = useMemo(() => {
    if (grainOverride !== 'auto') return grainOverride;
    return `${grain} (auto)`;
  }, [grainOverride, grain]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">World Cup Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Pre-game (Canvas) and Post-game (Campaign) delivery, sourced from Braze data_series
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync now
          </Button>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={grainOverride} onValueChange={(v) => setGrainOverride(v as any)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Grain" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Grain: auto</SelectItem>
              {GRAINS.map((g) => <SelectItem key={g.v} value={g.v}>Grain: {g.l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {data.lastSyncedAt && (
            <p className="text-xs text-muted-foreground">
              Last Braze sync: {new Date(data.lastSyncedAt).toLocaleString()} · Grain: <span className="text-foreground">{effectiveGrainLabel}</span>
            </p>
          )}

          <WcExecutiveKPIs data={data} />

          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="inline-flex h-10 w-auto flex-wrap">
              <TabsTrigger value="overview" className="inline-flex items-center gap-1.5 px-3">
                <LayoutDashboard className="h-3.5 w-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="pregame" className="inline-flex items-center gap-1.5 px-3">
                <Bell className="h-3.5 w-3.5" /> Pre-game
              </TabsTrigger>
              <TabsTrigger value="postgame" className="inline-flex items-center gap-1.5 px-3">
                <Trophy className="h-3.5 w-3.5" /> Post-game
              </TabsTrigger>
              <TabsTrigger value="permatch" className="inline-flex items-center gap-1.5 px-3">
                <Calendar className="h-3.5 w-3.5" /> Per-match
              </TabsTrigger>
              <TabsTrigger value="health" className="inline-flex items-center gap-1.5 px-3">
                <Activity className="h-3.5 w-3.5" /> Scheduler health
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview"><WcOverviewSection data={data} /></TabsContent>
            <TabsContent value="pregame"><WcPreGameSection data={data} /></TabsContent>
            <TabsContent value="postgame"><WcPostGameSection data={data} /></TabsContent>
            <TabsContent value="permatch"><WcPerMatchSection data={data} /></TabsContent>
            <TabsContent value="health"><WcSchedulerHealthSection data={data} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
