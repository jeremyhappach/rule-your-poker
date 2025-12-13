-- Add rabbit_hunt to games table for Holm games
ALTER TABLE public.games ADD COLUMN rabbit_hunt boolean NOT NULL DEFAULT false;

-- Add rabbit_hunt to game_defaults table
ALTER TABLE public.game_defaults ADD COLUMN rabbit_hunt boolean NOT NULL DEFAULT false;