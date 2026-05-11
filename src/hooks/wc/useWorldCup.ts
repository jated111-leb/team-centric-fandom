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
    queryKey: ['wc_analytics', days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const [ledger, sends, gapAlerts, matches] = await Promise.all([
        db.from('wc_schedule_ledger').select('*').gte('created_at', since),
        db
          .from('wc_notification_sends')
          .select('*')
          .gte('created_at', since)
          .in('delivery_status', ['canvas.sent', 'push_sent']),
        db
          .from('wc_scheduler_logs')
          .select('*', { count: 'exact', head: true })
          .eq('function_name', 'gap-detection-worldcup')
          .eq('log_level', 'warn')
          .gte('created_at', since),
        db.from('wc_matches').select('id, stage'),
      ]);
      if (ledger.error) throw ledger.error;
      if (sends.error) throw sends.error;
      if (matches.error) throw matches.error;

      const ledgerRows = (ledger.data || []) as WcScheduleLedger[];
      const sendRows = (sends.data || []) as any[];
      const matchRows = (matches.data || []) as { id: string; stage: string }[];
      const matchStage: Record<string, string> = {};
      matchRows.forEach((m) => (matchStage[m.id] = m.stage));

      const uniqueUsers = new Set(sendRows.map((s) => s.external_user_id).filter(Boolean));

      // per team
      const perTeam: Record<string, number> = {};
      ledgerRows.forEach((r) => {
        perTeam[r.target_team_canonical] = (perTeam[r.target_team_canonical] || 0) + 1;
      });

      // per stage
      const perStage: Record<string, number> = {};
      ledgerRows.forEach((r) => {
        const stage = matchStage[r.match_id] || 'UNKNOWN';
        perStage[stage] = (perStage[stage] || 0) + 1;
      });

      // hourly distribution of delivered sends
      const hourly: number[] = Array(24).fill(0);
      sendRows.forEach((s) => {
        const t = s.delivered_at || s.created_at;
        if (t) hourly[new Date(t).getUTCHours()]++;
      });

      return {
        scheduled: ledgerRows.length,
        delivered: sendRows.length,
        uniqueUsers: uniqueUsers.size,
        gapAlerts: gapAlerts.count || 0,
        perTeam: Object.entries(perTeam)
          .map(([team, count]) => ({ team, count }))
          .sort((a, b) => b.count - a.count),
        perStage: Object.entries(perStage).map(([stage, count]) => ({ stage, count })),
        hourly: hourly.map((count, hour) => ({ hour: `${hour}:00`, count })),
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
