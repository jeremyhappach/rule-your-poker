-- Add horses_state column to rounds table for storing dice game state
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS horses_state jsonb;