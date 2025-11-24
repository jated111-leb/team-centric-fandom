-- Phase 3: Create team_mappings table for canonical team name mapping
CREATE TABLE IF NOT EXISTS public.team_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_mappings ENABLE ROW LEVEL SECURITY;

-- Anyone can view team mappings
CREATE POLICY "Anyone can view team mappings"
  ON public.team_mappings
  FOR SELECT
  USING (true);

-- Authenticated users can manage team mappings
CREATE POLICY "Authenticated users can manage team mappings"
  ON public.team_mappings
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create index for faster pattern matching
CREATE INDEX idx_team_mappings_canonical ON public.team_mappings(canonical_name);

-- Phase 4: Create scheduler_logs table for monitoring skips and errors
CREATE TABLE IF NOT EXISTS public.scheduler_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  match_id BIGINT,
  action TEXT NOT NULL,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduler_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can view logs
CREATE POLICY "Anyone can view scheduler logs"
  ON public.scheduler_logs
  FOR SELECT
  USING (true);

-- Authenticated users can insert logs
CREATE POLICY "Authenticated users can insert scheduler logs"
  ON public.scheduler_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create indexes for efficient querying
CREATE INDEX idx_scheduler_logs_function ON public.scheduler_logs(function_name);
CREATE INDEX idx_scheduler_logs_match ON public.scheduler_logs(match_id);
CREATE INDEX idx_scheduler_logs_created ON public.scheduler_logs(created_at DESC);
CREATE INDEX idx_scheduler_logs_action ON public.scheduler_logs(action);

-- Add trigger for team_mappings updated_at
CREATE TRIGGER update_team_mappings_updated_at
  BEFORE UPDATE ON public.team_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_matches_updated_at();

-- Insert default canonical team mappings
INSERT INTO public.team_mappings (pattern, canonical_name) VALUES
  ('real.*madrid|madrid.*cf', 'Real Madrid CF'),
  ('fc.*barcelona|barcelona.*fc|barça|barca', 'FC Barcelona'),
  ('manchester.*city|city.*fc', 'Manchester City FC'),
  ('manchester.*united|united.*fc|man.*utd', 'Manchester United FC'),
  ('liverpool.*fc|fc.*liverpool', 'Liverpool FC'),
  ('arsenal.*fc|fc.*arsenal', 'Arsenal FC'),
  ('bayern.*münchen|fc.*bayern|bayern.*munich', 'FC Bayern München'),
  ('paris.*saint.*germain|psg|saint.*germain', 'Paris Saint-Germain FC'),
  ('juventus.*fc|fc.*juventus|juve', 'Juventus FC'),
  ('inter.*milan|fc.*internazionale|inter', 'Inter Milan')
ON CONFLICT DO NOTHING;