-- Add gin_rummy_state JSONB column to rounds table (mirrors cribbage_state pattern)
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS gin_rummy_state jsonb DEFAULT NULL;

-- Add gin-rummy to realtime publication (rounds table is already in publication, so this is a no-op safety check)
