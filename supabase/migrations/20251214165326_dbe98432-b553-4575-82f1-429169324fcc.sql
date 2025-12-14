-- Add reveal_at_showdown column to game_defaults table for 3-5-7 games
ALTER TABLE public.game_defaults 
ADD COLUMN reveal_at_showdown BOOLEAN NOT NULL DEFAULT false;

-- Add reveal_at_showdown column to games table for game instances
ALTER TABLE public.games 
ADD COLUMN reveal_at_showdown BOOLEAN NOT NULL DEFAULT false;