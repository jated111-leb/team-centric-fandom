-- Create matches table for football data
CREATE TABLE public.matches (
  id bigint PRIMARY KEY,
  competition text NOT NULL,
  competition_name text NOT NULL,
  matchday text,
  match_date date NOT NULL,
  match_time time,
  utc_date timestamptz NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  home_team_id bigint,
  away_team_id bigint,
  status text NOT NULL DEFAULT 'SCHEDULED',
  score_home int,
  score_away int,
  stage text,
  priority text NOT NULL DEFAULT 'Low',
  priority_score int NOT NULL DEFAULT 0,
  priority_reason text,
  channel text,
  studio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_matches_date ON public.matches(match_date);
CREATE INDEX idx_matches_competition ON public.matches(competition);
CREATE INDEX idx_matches_priority ON public.matches(priority);
CREATE INDEX idx_matches_date_competition ON public.matches(match_date, competition);

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view matches"
ON public.matches
FOR SELECT
USING (true);

-- Staff write access (for manual channel/studio assignments)
CREATE POLICY "Authenticated users can update matches"
ON public.matches
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert matches"
ON public.matches
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_matches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_matches_timestamp
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.update_matches_updated_at();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;