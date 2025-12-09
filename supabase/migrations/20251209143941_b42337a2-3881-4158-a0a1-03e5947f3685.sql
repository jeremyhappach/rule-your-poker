-- Add bot_use_hand_strength column to game_defaults table
ALTER TABLE public.game_defaults 
ADD COLUMN bot_use_hand_strength boolean NOT NULL DEFAULT true;

-- Update existing rows to use hand strength by default
UPDATE public.game_defaults SET bot_use_hand_strength = true;