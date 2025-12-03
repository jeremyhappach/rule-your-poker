-- Enable full replica identity for players table to support realtime updates
ALTER TABLE public.players REPLICA IDENTITY FULL;