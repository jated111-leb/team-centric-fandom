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
export type WcAnalyticsGrain = 'day' | 'week' | 'month';

export interface WcMatchAnalytics {
  matchId: string;
  kickoffUtc: string;
  homeTeam: string;
  awayTeam: string;
  stage: string;
  group: string | null;
  status: string;
  scoreHome: number | null;
  scoreAway: number | null;
  preGameStatus: 'none' | 'queued' | 'sent' | 'delivered' | 'error';
  preGameTargets: string[];
  preGameSendAt: string | null;
  preGameDispatchId: string | null;
  congratsStatus: 'none' | 'sent' | 'skipped' | 'error' | 'dry_run' | 'pending';
  congratsWinner: string | null;
  congratsDispatchId: string | null;
  health: 'ok' | 'missing-pregame' | 'missing-congrats' | 'duplicate' | 'error';
}

export interface WcAnalyticsBundle {
  range: { start: string; end: string; days: number };
  lastSyncedAt: string | null;
  preGame: {
    sent: number;
    uniqueRecipients: number;
    opens: number;
    directOpens: number;
    bodyClicks: number;
    bounces: number;
    entries: number;
    scheduled: number;
    daily: { bucket: string; sent: number; uniqueRecipients: number; opens: number; clicks: number }[];
    perTeam: { team: string; queued: number; sent: number; delivered: number; total: number }[];
    perStage: { stage: string; total: number }[];
    hourly: { hour: number; count: number }[];
  };
  postGame: {
    sent: number;
    uniqueRecipients: number;
    directOpens: number;
    totalOpens: number;
    bodyClicks: number;
    bounces: number;
    conversions: number;
    triggered: number;
    daily: { bucket: string; sent: number; uniqueRecipients: number; opens: number; clicks: number; conversions: number }[];
    perTeam: { team: string; count: number }[];
    channelSplit: { channel: string; sent: number; opens: number; clicks: number }[];
    latencyMinutes: number[];
  };
  gapAlerts: number;
  perMatch: WcMatchAnalytics[];
  schedulerHealth: {
    ledgerDuplicates: { matchId: string; matchLabel: string; count: number }[];
    stalePending: { matchId: string; matchLabel: string; sendAtUtc: string; createdAt: string }[];
    recentErrors: { createdAt: string; functionName: string; message: string }[];
  };
}

const STAGE_ORDER = [
  'GROUP_STAGE', 'LAST_32', 'LAST_16', 'QUARTER_FINALS',
  'SEMI_FINALS', 'THIRD_PLACE', 'FINAL', 'FRIENDLY',
];

function bucketKey(iso: string, grain: WcAnalyticsGrain): string {
  const d = new Date(iso);
  if (grain === 'day') return d.toISOString().slice(0, 10);
  if (grain === 'month') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() - (day - 1));
  return tmp.toISOString().slice(0, 10);
}

export function useWcAnalytics(days: number = 7, grain: WcAnalyticsGrain = 'day') {
  return useQuery({
    queryKey: ['wc_analytics_bundle', days, grain],
    queryFn: async (): Promise<WcAnalyticsBundle> => {
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      const sinceIso = start.toISOString();
      const sinceDate = sinceIso.slice(0, 10);

      const [ledgerRes, statsRes, gapRes, matchesRes, congratsRes, logsRes] = await Promise.all([
        db.from('wc_schedule_ledger').select('*').gte('created_at', sinceIso),
        db.from('wc_canvas_daily_stats').select('*').gte('stat_date', sinceDate).order('stat_date', { ascending: true }),
        db.from('wc_scheduler_logs').select('*', { count: 'exact', head: true })
          .eq('function_name', 'gap-detection-worldcup').eq('log_level', 'warn').gte('created_at', sinceIso),
        db.from('wc_matches').select('id, home_team_canonical, away_team_canonical, kickoff_utc, stage, group_letter, status, score_home, score_away, congrats_status').gte('kickoff_utc', sinceIso),
        db.from('wc_congrats_ledger').select('*').gte('created_at', sinceIso),
        db.from('wc_scheduler_logs').select('created_at, function_name, message')
          .eq('log_level', 'error').gte('created_at', sinceIso)
          .order('created_at', { ascending: false }).limit(20),
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      if (statsRes.error) throw statsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      if (congratsRes.error) throw congratsRes.error;

      const ledger = (ledgerRes.data || []) as WcScheduleLedger[];
      const stats = (statsRes.data || []) as any[];
      const matches = (matchesRes.data || []) as any[];
      const congrats = (congratsRes.data || []) as any[];
      const errorLogs = (logsRes.data || []) as any[];

      const canvasRows = stats.filter((r) => r.object_type === 'canvas');
      const campaignRows = stats.filter((r) => r.object_type === 'campaign');

      let lastSynced: string | null = null;
      for (const r of stats) if (!lastSynced || (r.synced_at && r.synced_at > lastSynced)) lastSynced = r.synced_at;

      const pgDaily: Record<string, { bucket: string; sent: number; uniqueRecipients: number; opens: number; clicks: number }> = {};
      const pg = { sent: 0, uniqueRecipients: 0, opens: 0, directOpens: 0, bodyClicks: 0, bounces: 0, entries: 0 };
      for (const r of canvasRows) {
        pg.sent += r.sent || 0;
        pg.uniqueRecipients += r.unique_recipients || 0;
        pg.opens += r.total_opens || 0;
        pg.directOpens += r.direct_opens || 0;
        pg.bodyClicks += r.body_clicks || 0;
        pg.bounces += r.bounces || 0;
        pg.entries += r.entries || 0;
        const k = bucketKey(r.stat_date, grain);
        if (!pgDaily[k]) pgDaily[k] = { bucket: k, sent: 0, uniqueRecipients: 0, opens: 0, clicks: 0 };
        pgDaily[k].sent += r.sent || 0;
        pgDaily[k].uniqueRecipients += r.unique_recipients || 0;
        pgDaily[k].opens += r.total_opens || 0;
        pgDaily[k].clicks += r.body_clicks || 0;
      }

      const perTeamMap = new Map<string, { team: string; queued: number; sent: number; delivered: number; total: number }>();
      for (const r of ledger) {
        const team = r.target_team_canonical || 'Unknown';
        const e = perTeamMap.get(team) || { team, queued: 0, sent: 0, delivered: 0, total: 0 };
        e.total++;
        if (r.status === 'queued') e.queued++;
        else if (r.status === 'sent_to_braze' || r.status === 'sent') e.sent++;
        else if (r.status === 'delivered') e.delivered++;
        perTeamMap.set(team, e);
      }

      const matchById = new Map<string, any>();
      matches.forEach((m) => matchById.set(m.id, m));
      const perStageMap = new Map<string, number>();
      for (const r of ledger) {
        const m = matchById.get(r.match_id);
        const stage = m?.stage || 'UNKNOWN';
        perStageMap.set(stage, (perStageMap.get(stage) || 0) + 1);
      }
      const perStage = Array.from(perStageMap.entries())
        .map(([stage, total]) => ({ stage, total }))
        .sort((a, b) => {
          const ai = STAGE_ORDER.indexOf(a.stage);
          const bi = STAGE_ORDER.indexOf(b.stage);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

      const hourlyMap = new Map<number, number>();
      for (const r of ledger) {
        if (!r.scheduled_send_at_utc) continue;
        const h = new Date(r.scheduled_send_at_utc).getUTCHours();
        hourlyMap.set(h, (hourlyMap.get(h) || 0) + 1);
      }
      const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourlyMap.get(h) || 0 }));

      const cgDaily: Record<string, { bucket: string; sent: number; uniqueRecipients: number; opens: number; clicks: number; conversions: number }> = {};
      const cg = { sent: 0, uniqueRecipients: 0, directOpens: 0, totalOpens: 0, bodyClicks: 0, bounces: 0, conversions: 0 };
      const channelAgg: Record<string, { channel: string; sent: number; opens: number; clicks: number }> = {};
      for (const r of campaignRows) {
        cg.sent += r.sent || 0;
        cg.uniqueRecipients += r.unique_recipients || 0;
        cg.directOpens += r.direct_opens || 0;
        cg.totalOpens += r.total_opens || 0;
        cg.bodyClicks += r.body_clicks || 0;
        cg.bounces += r.bounces || 0;
        cg.conversions += r.conversions || 0;
        const k = bucketKey(r.stat_date, grain);
        if (!cgDaily[k]) cgDaily[k] = { bucket: k, sent: 0, uniqueRecipients: 0, opens: 0, clicks: 0, conversions: 0 };
        cgDaily[k].sent += r.sent || 0;
        cgDaily[k].uniqueRecipients += r.unique_recipients || 0;
        cgDaily[k].opens += r.direct_opens || 0;
        cgDaily[k].clicks += r.body_clicks || 0;
        cgDaily[k].conversions += r.conversions || 0;
        const vb = r.variant_breakdown || {};
        for (const channel of Object.keys(vb)) {
          const arr = Array.isArray(vb[channel]) ? vb[channel] : [];
          if (!channelAgg[channel]) channelAgg[channel] = { channel, sent: 0, opens: 0, clicks: 0 };
          for (const v of arr) {
            channelAgg[channel].sent += v.sent || 0;
            channelAgg[channel].opens += v.direct_opens || v.total_opens || 0;
            channelAgg[channel].clicks += v.body_clicks || 0;
          }
        }
      }

      const cgTeamMap = new Map<string, number>();
      const latencyMinutes: number[] = [];
      for (const c of congrats) {
        if (c.status === 'sent') {
          cgTeamMap.set(c.winning_team_canonical, (cgTeamMap.get(c.winning_team_canonical) || 0) + 1);
        }
        const m = matchById.get(c.match_id);
        if (m && c.created_at && m.kickoff_utc) {
          const matchEnd = new Date(m.kickoff_utc).getTime() + 110 * 60 * 1000;
          const sendAt = new Date(c.created_at).getTime();
          const minutes = Math.round((sendAt - matchEnd) / 60000);
          if (minutes >= 0 && minutes < 480) latencyMinutes.push(minutes);
        }
      }

      const ledgerByMatch = new Map<string, WcScheduleLedger[]>();
      ledger.forEach((r) => {
        const list = ledgerByMatch.get(r.match_id) || [];
        list.push(r);
        ledgerByMatch.set(r.match_id, list);
      });
      const congratsByMatch = new Map<string, any>();
      congrats.forEach((c) => congratsByMatch.set(c.match_id, c));

      const perMatch: WcMatchAnalytics[] = matches
        .sort((a, b) => new Date(b.kickoff_utc).getTime() - new Date(a.kickoff_utc).getTime())
        .map((m) => {
          const rows = ledgerByMatch.get(m.id) || [];
          const cgRow = congratsByMatch.get(m.id);
          const pgStatus: WcMatchAnalytics['preGameStatus'] = rows.length === 0
            ? 'none'
            : rows.some((r) => r.status === 'delivered') ? 'delivered'
            : rows.some((r) => r.status === 'sent_to_braze' || r.status === 'sent') ? 'sent'
            : rows.some((r) => r.status === 'error') ? 'error'
            : 'queued';
          const congratsStatus: WcMatchAnalytics['congratsStatus'] = (cgRow?.status || m.congrats_status || 'none') as any;
          const targets = Array.from(new Set(rows.map((r) => r.target_team_canonical)));
          const isDuplicate = rows.length > targets.length;
          const winnerExists = m.score_home != null && m.score_away != null && m.score_home !== m.score_away;
          let health: WcMatchAnalytics['health'] = 'ok';
          if (isDuplicate) health = 'duplicate';
          else if (rows.some((r) => r.status === 'error')) health = 'error';
          else if (new Date(m.kickoff_utc) < new Date() && pgStatus === 'none') health = 'missing-pregame';
          else if (m.status === 'FINISHED' && winnerExists && (!cgRow || cgRow.status === 'pending')) health = 'missing-congrats';

          return {
            matchId: m.id,
            kickoffUtc: m.kickoff_utc,
            homeTeam: m.home_team_canonical,
            awayTeam: m.away_team_canonical,
            stage: m.stage,
            group: m.group_letter,
            status: m.status,
            scoreHome: m.score_home,
            scoreAway: m.score_away,
            preGameStatus: pgStatus,
            preGameTargets: targets,
            preGameSendAt: rows[0]?.scheduled_send_at_utc || null,
            preGameDispatchId: rows.find((r) => r.braze_send_id)?.braze_send_id || null,
            congratsStatus,
            congratsWinner: cgRow?.winning_team_canonical || null,
            congratsDispatchId: cgRow?.braze_dispatch_id || null,
            health,
          };
        });

      const dupMap = new Map<string, number>();
      for (const r of ledger) dupMap.set(r.match_id, (dupMap.get(r.match_id) || 0) + 1);
      const ledgerDuplicates = Array.from(dupMap.entries())
        .filter(([, c]) => c > 1)
        .map(([matchId, count]) => {
          const m = matchById.get(matchId);
          return { matchId, matchLabel: m ? `${m.home_team_canonical} vs ${m.away_team_canonical}` : matchId, count };
        });
      const stalePending = ledger
        .filter((r) => r.status === 'queued' && new Date(r.scheduled_send_at_utc) < new Date())
        .map((r) => {
          const m = matchById.get(r.match_id);
          return {
            matchId: r.match_id,
            matchLabel: m ? `${m.home_team_canonical} vs ${m.away_team_canonical}` : r.match_id,
            sendAtUtc: r.scheduled_send_at_utc,
            createdAt: r.created_at,
          };
        });
      const recentErrors = errorLogs.map((l) => ({
        createdAt: l.created_at, functionName: l.function_name, message: l.message || 'unknown',
      }));

      return {
        range: { start: sinceIso, end: end.toISOString(), days },
        lastSyncedAt: lastSynced,
        preGame: {
          ...pg,
          scheduled: ledger.length,
          daily: Object.values(pgDaily).sort((a, b) => a.bucket.localeCompare(b.bucket)),
          perTeam: Array.from(perTeamMap.values()).sort((a, b) => b.total - a.total),
          perStage,
          hourly,
        },
        postGame: {
          ...cg,
          triggered: congrats.filter((c) => c.status === 'sent').length,
          daily: Object.values(cgDaily).sort((a, b) => a.bucket.localeCompare(b.bucket)),
          perTeam: Array.from(cgTeamMap.entries()).map(([team, count]) => ({ team, count })).sort((a, b) => b.count - a.count),
          channelSplit: Object.values(channelAgg),
          latencyMinutes,
        },
        gapAlerts: gapRes.count || 0,
        perMatch,
        schedulerHealth: { ledgerDuplicates, stalePending, recentErrors },
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
