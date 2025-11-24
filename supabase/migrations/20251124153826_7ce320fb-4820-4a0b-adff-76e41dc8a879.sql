-- Add legs column to players table to track rounds won
ALTER TABLE public.players
ADD COLUMN legs integer NOT NULL DEFAULT 0;

-- Add is_bot column to identify computer players
ALTER TABLE public.players
ADD COLUMN is_bot boolean NOT NULL DEFAULT false;