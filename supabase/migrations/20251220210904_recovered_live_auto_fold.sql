-- Add auto_fold column to players table
ALTER TABLE public.players ADD COLUMN auto_fold boolean NOT NULL DEFAULT false;
