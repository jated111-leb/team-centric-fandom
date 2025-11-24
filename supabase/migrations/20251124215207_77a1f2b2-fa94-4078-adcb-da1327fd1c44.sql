-- Create featured_teams table for dynamic team management
CREATE TABLE IF NOT EXISTS public.featured_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.featured_teams ENABLE ROW LEVEL SECURITY;

-- Anyone can view featured teams
CREATE POLICY "Anyone can view featured teams"
  ON public.featured_teams
  FOR SELECT
  USING (true);

-- Authenticated users can manage featured teams
CREATE POLICY "Authenticated users can manage featured teams"
  ON public.featured_teams
  FOR ALL
  USING (auth.uid() IS NOT NULL);

-- Create index for faster lookups
CREATE INDEX idx_featured_teams_name ON public.featured_teams(team_name);

-- Add trigger for updated_at
CREATE TRIGGER update_featured_teams_updated_at
  BEFORE UPDATE ON public.featured_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_matches_updated_at();

-- Insert default featured teams
INSERT INTO public.featured_teams (team_name) VALUES
  ('Real Madrid CF'),
  ('FC Barcelona'),
  ('Manchester City FC'),
  ('Manchester United FC'),
  ('Liverpool FC'),
  ('Arsenal FC'),
  ('FC Bayern München'),
  ('Paris Saint-Germain FC'),
  ('Juventus FC'),
  ('Inter Milan')
ON CONFLICT (team_name) DO NOTHING;