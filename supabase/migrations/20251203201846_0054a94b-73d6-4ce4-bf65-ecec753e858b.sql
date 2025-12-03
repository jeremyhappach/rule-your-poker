-- Add column to store remaining time when game is paused
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS paused_time_remaining integer DEFAULT NULL;

-- Comment explaining the column
COMMENT ON COLUMN public.games.paused_time_remaining IS 'Stores the remaining seconds on decision timer when game is paused. Used to restore timer on resume.';