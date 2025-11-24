-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Feature flags table for toggle control
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feature flags"
  ON public.feature_flags
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update feature flags"
  ON public.feature_flags
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Insert default Braze toggle (disabled by default)
INSERT INTO public.feature_flags (flag_name, enabled, description)
VALUES ('braze_notifications_enabled', false, 'Enable/disable Braze push notification scheduling')
ON CONFLICT (flag_name) DO NOTHING;

-- Schedule ledger table
CREATE TABLE IF NOT EXISTS public.schedule_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id bigint NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  braze_schedule_id text NOT NULL,
  signature text NOT NULL,
  send_at_utc timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(match_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_ledger_match_id ON public.schedule_ledger(match_id);
CREATE INDEX IF NOT EXISTS idx_schedule_ledger_send_at ON public.schedule_ledger(send_at_utc);

ALTER TABLE public.schedule_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view schedule ledger"
  ON public.schedule_ledger
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage schedule ledger"
  ON public.schedule_ledger
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Team translations table
CREATE TABLE IF NOT EXISTS public.team_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL UNIQUE,
  arabic_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.team_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team translations"
  ON public.team_translations
  FOR SELECT
  USING (true);

-- Seed team translations
INSERT INTO public.team_translations (team_name, arabic_name) VALUES
  ('Real Madrid CF', 'ريال مدريد'),
  ('FC Barcelona', 'برشلونة'),
  ('Manchester City FC', 'مانشستر سيتي'),
  ('Liverpool FC', 'ليفربول'),
  ('Manchester United FC', 'مانشستر يونايتد'),
  ('Arsenal FC', 'آرسنال'),
  ('FC Bayern München', 'بايرن ميونخ'),
  ('Paris Saint-Germain FC', 'باريس سان جيرمان'),
  ('Juventus FC', 'يوفنتوس'),
  ('Inter Milan', 'إنتر ميلان')
ON CONFLICT (team_name) DO NOTHING;

-- Competition translations table
CREATE TABLE IF NOT EXISTS public.competition_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_code text NOT NULL UNIQUE,
  english_name text NOT NULL,
  arabic_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.competition_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view competition translations"
  ON public.competition_translations
  FOR SELECT
  USING (true);

-- Seed competition translations
INSERT INTO public.competition_translations (competition_code, english_name, arabic_name) VALUES
  ('PL', 'The Premier League', 'الدوري الإنجليزي الممتاز'),
  ('PD', 'LaLiga', 'الدوري الإسباني'),
  ('CL', 'UEFA Champions League', 'دوري أبطال أوروبا'),
  ('EL', 'UEFA Europa League', 'الدوري الأوروبي'),
  ('SA', 'Serie A', 'الدوري الإيطالي'),
  ('BL1', 'Bundesliga', 'الدوري الألماني'),
  ('FL1', 'Ligue 1', 'الدوري الفرنسي'),
  ('ELC', 'EFL Championship', 'الدوري الإنجليزي الدرجة الثانية')
ON CONFLICT (competition_code) DO NOTHING;

-- Trigger for updated_at on feature_flags
CREATE OR REPLACE FUNCTION public.update_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feature_flags_updated_at();

-- Trigger for updated_at on schedule_ledger
CREATE OR REPLACE FUNCTION public.update_schedule_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_schedule_ledger_updated_at
  BEFORE UPDATE ON public.schedule_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.update_schedule_ledger_updated_at();