-- Change default ante_amount from 2 to 1 in games table
ALTER TABLE public.games ALTER COLUMN ante_amount SET DEFAULT 1;

-- Change default ante_amount from 2 to 1 in game_defaults table
ALTER TABLE public.game_defaults ALTER COLUMN ante_amount SET DEFAULT 1;