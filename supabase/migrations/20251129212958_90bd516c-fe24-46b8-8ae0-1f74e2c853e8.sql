-- Add game_type column to games table to track which game variant is being played
ALTER TABLE public.games 
ADD COLUMN game_type text DEFAULT '3-5-7';

-- Add comment for documentation
COMMENT ON COLUMN public.games.game_type IS 'The type of game being played (3-5-7, holm-game, straight-cincinnati, low-cincinnati)';