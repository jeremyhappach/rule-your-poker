-- Enable REPLICA IDENTITY FULL on players table for realtime updates to work with filters
ALTER TABLE public.players REPLICA IDENTITY FULL;