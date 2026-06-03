export interface WcMatch {
  id: string;
  football_data_id: number;
  competition_code: string;
  home_team_canonical: string;
  away_team_canonical: string;
  home_team_iso: string | null;
  away_team_iso: string | null;
  kickoff_utc: string;
  venue: string | null;
  venue_timezone: string | null;
  stage: string;
  group_letter: string | null;
  priority_flag: string | null;
  featured_match: boolean;
  status: string;
  raw_api_payload: any;
  last_synced_at: string | null;
  created_at: string;
}

export interface WcScheduleLedger {
  id: string;
  match_id: string;
  braze_canvas_id: string;
  braze_send_id: string | null;
  target_team_canonical: string;
  scheduled_send_at_utc: string;
  status: string;
  signature: string;
  error_message: string | null;
  attempt_count: number;
  dry_run: boolean;
  created_at: string;
  updated_at: string;
}

export interface WcNotificationSend {
  id: string;
  ledger_id: string | null;
  braze_dispatch_id: string | null;
  braze_send_id: string | null;
  external_user_id: string | null;
  delivered_at: string | null;
  delivery_status: string | null;
  braze_event_type: string | null;
  braze_webhook_payload: any;
  created_at: string;
}

export interface WcSchedulerLog {
  id: string;
  function_name: string;
  log_level: string;
  match_id: string | null;
  message: string | null;
  context: any;
  created_at: string;
}

export interface WcFeaturedTeam {
  id: string;
  canonical_name: string;
  iso_code: string;
  display_name_en: string;
  display_name_ar: string;
  braze_attribute_value: string;
  priority_flag: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WcTeamMapping {
  id: string;
  featured_team_id: string;
  football_data_name: string;
  football_data_id: number | null;
  match_pattern: string | null;
  created_at: string;
}

export interface WcFeatureFlag {
  key: string;
  enabled: boolean;
  value: string | null;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export const WC_FUNCTION_NAMES = [
  'sync-worldcup-data',
  'sync-worldcup-friendlies',
  'braze-worldcup-scheduler',
  'braze-worldcup-reconcile',
  'gap-detection-worldcup',
  'pre-send-verification-worldcup',
] as const;

export type WcFunctionName = (typeof WC_FUNCTION_NAMES)[number];
