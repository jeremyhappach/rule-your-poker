-- Ensure games table has REPLICA IDENTITY FULL for complete realtime updates
ALTER TABLE public.games REPLICA IDENTITY FULL;