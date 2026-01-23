-- Add auto_ante_runback column to players table
ALTER TABLE public.players
ADD COLUMN auto_ante_runback boolean NOT NULL DEFAULT false;