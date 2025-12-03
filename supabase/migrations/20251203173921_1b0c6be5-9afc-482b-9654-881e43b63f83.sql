-- Enable full replica identity for games table to ensure realtime works properly
ALTER TABLE public.games REPLICA IDENTITY FULL;