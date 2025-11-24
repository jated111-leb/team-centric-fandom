-- Set replica identity for realtime updates
ALTER TABLE public.matches REPLICA IDENTITY FULL;