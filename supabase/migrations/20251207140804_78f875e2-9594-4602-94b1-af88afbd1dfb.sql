-- Add waiting column to players table
ALTER TABLE public.players ADD COLUMN waiting boolean NOT NULL DEFAULT false;