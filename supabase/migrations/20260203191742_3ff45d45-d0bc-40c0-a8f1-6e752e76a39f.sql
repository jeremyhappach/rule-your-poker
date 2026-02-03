-- Add cribbage-specific configuration columns to games table
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS points_to_win INTEGER DEFAULT 121,
ADD COLUMN IF NOT EXISTS skunk_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS skunk_threshold INTEGER DEFAULT 91,
ADD COLUMN IF NOT EXISTS double_skunk_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS double_skunk_threshold INTEGER DEFAULT 61;