-- Add pussy_tax column to games table for configurable all-fold penalty
ALTER TABLE public.games 
ADD COLUMN pussy_tax integer NOT NULL DEFAULT 10;