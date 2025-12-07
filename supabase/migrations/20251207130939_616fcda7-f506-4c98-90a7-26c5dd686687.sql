-- Add mobile_view column to players table (nullable - null means use auto-detection)
ALTER TABLE public.players
ADD COLUMN mobile_view boolean DEFAULT NULL;