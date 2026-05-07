
CREATE TABLE IF NOT EXISTS public.wc_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  football_data_id INTEGER NOT NULL UNIQUE,
  competition_code TEXT NOT NULL DEFAULT 'WC',
  home_team_canonical TEXT NOT NULL,
  away_team_canonical TEXT NOT NULL,
  home_team_iso TEXT, away_team_iso TEXT,
  kickoff_utc TIMESTAMPTZ NOT NULL,
  venue TEXT, venue_timezone TEXT,
  stage TEXT NOT NULL, group_letter TEXT, priority_flag TEXT,
  featured_match BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  raw_api_payload JSONB,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wc_matches_football_data_id ON public.wc_matches(football_data_id);
CREATE INDEX IF NOT EXISTS idx_wc_matches_kickoff_utc ON public.wc_matches(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_wc_matches_featured ON public.wc_matches(featured_match) WHERE featured_match = true;
CREATE INDEX IF NOT EXISTS idx_wc_matches_status ON public.wc_matches(status);
ALTER TABLE public.wc_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_matches" ON public.wc_matches FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_matches" ON public.wc_matches FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wc_matches_audit_placeholder() ;
DROP TABLE public.wc_matches_audit_placeholder;

CREATE TABLE IF NOT EXISTS public.wc_featured_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  iso_code TEXT NOT NULL UNIQUE,
  display_name_en TEXT NOT NULL, display_name_ar TEXT NOT NULL,
  braze_attribute_value TEXT NOT NULL,
  priority_flag TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.wc_featured_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_featured_teams" ON public.wc_featured_teams FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_featured_teams" ON public.wc_featured_teams FOR SELECT USING (has_role(auth.uid(),'admin'));

INSERT INTO public.wc_featured_teams (canonical_name, iso_code, display_name_en, display_name_ar, braze_attribute_value, priority_flag) VALUES
  ('Iraq','IRQ','Iraq','العراق','Iraq','host_team'),
  ('Saudi Arabia','KSA','Saudi Arabia','السعودية','Saudi Arabia',NULL),
  ('Morocco','MAR','Morocco','المغرب','Morocco',NULL),
  ('Algeria','DZA','Algeria','الجزائر','Algeria',NULL),
  ('Tunisia','TUN','Tunisia','تونس','Tunisia',NULL),
  ('Egypt','EGY','Egypt','مصر','Egypt',NULL),
  ('Brazil','BRA','Brazil','البرازيل','Brazil','marquee'),
  ('Argentina','ARG','Argentina','الأرجنتين','Argentina','marquee'),
  ('France','FRA','France','فرنسا','France','marquee'),
  ('Germany','DEU','Germany','ألمانيا','Germany','marquee'),
  ('Spain','ESP','Spain','إسبانيا','Spain','marquee'),
  ('Portugal','POR','Portugal','البرتغال','Portugal','marquee')
ON CONFLICT (canonical_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wc_team_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  featured_team_id UUID NOT NULL REFERENCES public.wc_featured_teams(id) ON DELETE CASCADE,
  football_data_name TEXT NOT NULL,
  football_data_id INTEGER,
  match_pattern TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wc_mappings_team_id ON public.wc_team_mappings(featured_team_id);
CREATE INDEX IF NOT EXISTS idx_wc_mappings_fd_name ON public.wc_team_mappings(football_data_name);
ALTER TABLE public.wc_team_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_team_mappings" ON public.wc_team_mappings FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_team_mappings" ON public.wc_team_mappings FOR SELECT USING (has_role(auth.uid(),'admin'));

INSERT INTO public.wc_team_mappings (featured_team_id, football_data_name)
SELECT id, canonical_name FROM public.wc_featured_teams;
INSERT INTO public.wc_team_mappings (featured_team_id, football_data_name)
SELECT t.id, v.alias FROM public.wc_featured_teams t
JOIN (VALUES ('Saudi Arabia','KSA'),('Morocco','Maroc'),('Algeria','Algérie'),('Egypt','Egypte'),('Germany','Deutschland'),('Spain','España'),('Brazil','Brasil')) AS v(canon, alias) ON v.canon = t.canonical_name;

CREATE TABLE IF NOT EXISTS public.wc_schedule_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.wc_matches(id) ON DELETE CASCADE,
  braze_canvas_id TEXT NOT NULL,
  braze_send_id TEXT,
  target_team_canonical TEXT NOT NULL,
  scheduled_send_at_utc TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  signature TEXT NOT NULL UNIQUE,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wc_ledger_match_id ON public.wc_schedule_ledger(match_id);
CREATE INDEX IF NOT EXISTS idx_wc_ledger_status ON public.wc_schedule_ledger(status);
CREATE INDEX IF NOT EXISTS idx_wc_ledger_send_at ON public.wc_schedule_ledger(scheduled_send_at_utc);
ALTER TABLE public.wc_schedule_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_schedule_ledger" ON public.wc_schedule_ledger FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_schedule_ledger" ON public.wc_schedule_ledger FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wc_notification_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID REFERENCES public.wc_schedule_ledger(id) ON DELETE SET NULL,
  braze_dispatch_id TEXT, braze_send_id TEXT,
  external_user_id TEXT,
  delivered_at TIMESTAMPTZ, delivery_status TEXT,
  braze_event_type TEXT, braze_webhook_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wc_sends_ledger_id ON public.wc_notification_sends(ledger_id);
ALTER TABLE public.wc_notification_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_notification_sends" ON public.wc_notification_sends FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_notification_sends" ON public.wc_notification_sends FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wc_scheduler_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  log_level TEXT NOT NULL DEFAULT 'info',
  match_id UUID,
  message TEXT, context JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wc_logs_function ON public.wc_scheduler_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_wc_logs_created ON public.wc_scheduler_logs(created_at DESC);
ALTER TABLE public.wc_scheduler_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_scheduler_logs" ON public.wc_scheduler_logs FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_scheduler_logs" ON public.wc_scheduler_logs FOR SELECT USING (has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.wc_feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  value TEXT, description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(), updated_by TEXT
);
ALTER TABLE public.wc_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_feature_flags" ON public.wc_feature_flags FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_feature_flags" ON public.wc_feature_flags FOR SELECT USING (has_role(auth.uid(),'admin'));

INSERT INTO public.wc_feature_flags (key, enabled, value, description) VALUES
  ('scheduler_enabled', true, NULL, 'Master switch — disable to halt all WC reminder scheduling'),
  ('iraq_safety_net_enabled', true, NULL, 'When true, Iraq matches are always queued even with zero declared favorites'),
  ('iraq_eliminated', false, NULL, 'Set true when Iraq is eliminated to stop creating Iraq ledger rows'),
  ('holdout_enabled', true, NULL, '10% control group excluded from sends'),
  ('holdout_percentage', true, '10', 'Percentage of WC-team-picking users in the holdout cohort'),
  ('dry_run_mode', true, NULL, 'When true, scheduler writes ledger rows but skips the Braze API call')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.wc_scheduler_locks (
  lock_name TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ, locked_by TEXT, expires_at TIMESTAMPTZ
);
ALTER TABLE public.wc_scheduler_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wc_scheduler_locks" ON public.wc_scheduler_locks FOR ALL USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "Admins view wc_scheduler_locks" ON public.wc_scheduler_locks FOR SELECT USING (has_role(auth.uid(),'admin'));
INSERT INTO public.wc_scheduler_locks (lock_name) VALUES ('braze-worldcup-scheduler'),('braze-worldcup-reconcile') ON CONFLICT DO NOTHING;
