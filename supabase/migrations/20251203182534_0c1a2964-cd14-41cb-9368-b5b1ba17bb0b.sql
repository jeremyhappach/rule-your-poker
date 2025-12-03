-- Add is_paused column to games table
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_paused boolean DEFAULT false;

-- Enable realtime for this column change
ALTER TABLE public.games REPLICA IDENTITY FULL;