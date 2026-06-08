import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  WcMatch,
  WcScheduleLedger,
  WcSchedulerLog,
  WcFeaturedTeam,
  WcTeamMapping,
  WcFeatureFlag,
  WcFunctionName,
} from '@/types/worldcup';

const db = supabase as any;

// ---- Matches ----
export function useWcMatches() {
  return useQuery({
    queryKey: ['wc_matches'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from('wc_matches')
        .select('*')
        .gte('kickoff_utc', now)
        .order('kickoff_utc', { ascending: true });
      if (error) throw error;
      return (data || []) as WcMatch[];
    },
  });
}

export function useWcLedgerCounts() {
  return useQuery({
    queryKey: ['wc_ledger_counts'],
    queryFn: async () => {
      const { data, error } = await db
        .from('wc_schedule_ledger')
        .select('match_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data || []) counts[r.match_id] = (counts[r.match_id] || 0) + 1;
      return counts;
    },
  });
}

// ---- Feature flags ----
export function useWcFeatureFlags() {
  return useQuery({
    queryKey: ['wc_feature_flags'],
    queryFn: async () => {
      const { data, error } = await db
        .from('wc_feature_flags')
        .select('*')
        .order('key');
      if (error) throw error;
      return (data || []) as WcFeatureFlag[];
    },
  });
}

export function useUpdateWcFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { key: string; enabled?: boolean; value?: string | null }) => {
      const patch: any = { updated_at: new Date().toISOString() };
      if (vars.enabled !== undefined) patch.enabled = vars.enabled;
      if (vars.value !== undefined) patch.value = vars.value;
      const { error } = await db.from('wc_feature_flags').update(patch).eq('key', vars.key);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wc_feature_flags'] }),
  });
}

// ---- Featured teams ----
export function useWcFeaturedTeams() {
  return useQuery({
    queryKey: ['wc_featured_teams'],
    queryFn: async () => {
      const { data, error } = await db.from('wc_featured_teams').select('*').order('canonical_name');
      if (error) throw error;
      return (data || []) as WcFeaturedTeam[];
    },
  });
}

export function useUpsertWcFeaturedTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (team: Partial<WcFeaturedTeam>) => {
      const { error } = await db.from('wc_featured_teams').upsert(team);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wc_featured_teams'] }),
  });
}

export function useDeleteWcFeaturedTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('wc_featured_teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wc_featured_teams'] }),
  });
}

// ---- Team mappings ----
export function useWcTeamMappings() {
  return useQuery({
    queryKey: ['wc_team_mappings'],
    queryFn: async () => {
      const { data, error } = await db.from('wc_team_mappings').select('*').order('football_data_name');
      if (error) throw error;
      return (data || []) as WcTeamMapping[];
    },
  });
}

export function useUpsertWcTeamMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mapping: Partial<WcTeamMapping>) => {
      const { error } = await db.from('wc_team_mappings').upsert(mapping);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wc_team_mappings'] }),
  });
}

export function useDeleteWcTeamMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('wc_team_mappings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wc_team_mappings'] }),
  });
}

// ---- Scheduler logs (live tail) ----
export function useWcSchedulerLogs(filters: {
  level?: string;
  functionName?: string;
  hours?: number;
  page?: number;
  pageSize?: number;
}) {
  const { level, functionName, hours = 24, page = 0, pageSize = 50 } = filters;
  return useQuery({
    queryKey: ['wc_scheduler_logs', level, functionName, hours, page, pageSize],
    queryFn: async () => {
      let q = db
        .from('wc_scheduler_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (level && level !== 'all') q = q.eq('log_level', level);
      if (functionName && functionName !== 'all') q = q.eq('function_name', functionName);
      if (hours) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        q = q.gte('created_at', since);
      }
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data || []) as WcSchedulerLog[], total: count || 0 };
    },
    refetchInterval: 5000,
  });
}

// ---- Analytics ----
export function useWcAnalytics(days: number = 7) {
  return useQuery({
    queryKey: ['wc_analytics_api', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const sinceDate = since.slice(0, 10);
      const [ledger, stats, gapAlerts, matches] = await Promise.all([
        db.from('wc_schedule_ledger').select('*').gte('created_at', since),
        db
          .from('wc_canvas_daily_stats')
          .select('*')
          .gte('stat_date', sinceDate)
          .order('stat_date', { ascending: true }),
        db
          .from('wc_scheduler_logs')
          .select('*', { count: 'exact', head: true })
          .eq('function_name', 'gap-detection-worldcup')
          .eq('log_level', 'warn')
          .gte('created_at', since),
        db.from('wc_matches').select('id, stage'),
      ]);
      if (ledger.error) throw ledger.error;
      if (stats.error) throw stats.error;
      if (matches.error) throw matches.error;

      const ledgerRows = (ledger.data || []) as WcScheduleLedger[];
      const statRows = (stats.data || []) as any[];
      const matchRows = (matches.data || []) as { id: string; stage: string }[];
      const matchStage: Record<string, string> = {};
      matchRows.forEach((m) => (matchStage[m.id] = m.stage));

      // KPIs from Braze API
      let sent = 0, opens = 0, uniqueRecipients = 0, bounces = 0, bodyClicks = 0;
      const dailySeries: Record<string, { date: string; sent: number; opens: number }> = {};
      let lastSyncedAt: string | null = null;
      let preGameSent = 0, congratsSent = 0;

      for (const r of statRows) {
        sent += r.sent || 0;
        opens += r.total_opens || 0;
        uniqueRecipients += r.unique_recipients || 0;
        bounces += r.bounces || 0;
        bodyClicks += r.body_clicks || 0;
        if (r.object_type === 'canvas') preGameSent += r.sent || 0;
        else congratsSent += r.sent || 0;
        const k = r.stat_date;
        if (!dailySeries[k]) dailySeries[k] = { date: k, sent: 0, opens: 0 };
        dailySeries[k].sent += r.sent || 0;
        dailySeries[k].opens += r.total_opens || 0;
        if (!lastSyncedAt || r.synced_at > lastSyncedAt) lastSyncedAt = r.synced_at;
      }

      const perTeam: Record<string, number> = {};
      ledgerRows.forEach((r) => {
        perTeam[r.target_team_canonical] = (perTeam[r.target_team_canonical] || 0) + 1;
      });
      const perStage: Record<string, number> = {};
      ledgerRows.forEach((r) => {
        const stage = matchStage[r.match_id] || 'UNKNOWN';
        perStage[stage] = (perStage[stage] || 0) + 1;
      });

      return {
        scheduled: ledgerRows.length,
        delivered: sent,
        uniqueUsers: uniqueRecipients,
        opens,
        openRate: sent > 0 ? Math.round((opens / sent) * 1000) / 10 : 0,
        bounces,
        bodyClicks,
        preGameSent,
        congratsSent,
        gapAlerts: gapAlerts.count || 0,
        lastSyncedAt,
        perTeam: Object.entries(perTeam)
          .map(([team, count]) => ({ team, count }))
          .sort((a, b) => b.count - a.count),
        perStage: Object.entries(perStage).map(([stage, count]) => ({ stage, count })),
        daily: Object.values(dailySeries).sort((a, b) => a.date.localeCompare(b.date)),
      };
    },
  });
}


// ---- Edge function invocations ----
export function useInvokeWcFunction() {
  return useMutation({
    mutationFn: async (vars: { name: WcFunctionName; body?: any }) => {
      const { data, error } = await supabase.functions.invoke(vars.name, { body: vars.body || {} });
      if (error) throw error;
      return data;
    },
  });
}
