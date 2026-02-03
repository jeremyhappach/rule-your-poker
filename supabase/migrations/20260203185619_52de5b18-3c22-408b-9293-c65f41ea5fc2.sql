-- Add cribbage-specific columns to game_defaults
ALTER TABLE public.game_defaults
ADD COLUMN IF NOT EXISTS points_to_win INTEGER NOT NULL DEFAULT 121,
ADD COLUMN IF NOT EXISTS skunk_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS skunk_threshold INTEGER NOT NULL DEFAULT 91,
ADD COLUMN IF NOT EXISTS double_skunk_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS double_skunk_threshold INTEGER NOT NULL DEFAULT 61;

-- Update the existing cribbage row with default values
UPDATE public.game_defaults
SET 
  points_to_win = 121,
  skunk_enabled = true,
  skunk_threshold = 91,
  double_skunk_enabled = true,
  double_skunk_threshold = 61
WHERE game_type = 'cribbage';