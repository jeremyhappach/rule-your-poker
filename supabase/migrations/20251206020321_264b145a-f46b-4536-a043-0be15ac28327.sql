-- Enable REPLICA IDENTITY FULL on rounds table for reliable realtime updates
ALTER TABLE public.rounds REPLICA IDENTITY FULL;