-- Add game_type column to game_results to store the game type when the result is recorded
ALTER TABLE public.game_results ADD COLUMN game_type text;