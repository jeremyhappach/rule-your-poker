-- Add real_money column to games table
ALTER TABLE public.games 
ADD COLUMN real_money boolean NOT NULL DEFAULT false;

-- Add real_money column to game_defaults table
ALTER TABLE public.game_defaults 
ADD COLUMN real_money boolean NOT NULL DEFAULT false;
