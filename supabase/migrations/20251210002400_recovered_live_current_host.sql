-- Add current_host column to games table to track the current host (who can be transferred)
ALTER TABLE public.games ADD COLUMN current_host uuid REFERENCES auth.users(id);

-- Create an index for efficient host lookups
CREATE INDEX idx_games_current_host ON public.games(current_host);
