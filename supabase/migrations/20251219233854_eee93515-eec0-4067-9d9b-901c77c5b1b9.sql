-- Change the default game_type from '3-5-7' to 'holm-game'
ALTER TABLE public.games ALTER COLUMN game_type SET DEFAULT 'holm-game'::text;