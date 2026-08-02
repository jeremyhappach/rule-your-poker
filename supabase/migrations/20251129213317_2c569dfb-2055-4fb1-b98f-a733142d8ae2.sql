
-- Add name column to games table for creative game names
ALTER TABLE public.games 
ADD COLUMN name text;

-- Add comment for documentation
COMMENT ON COLUMN public.games.name IS 'Creative name for the game session (e.g., "Nov 29 - Anthony Rizzo")';
