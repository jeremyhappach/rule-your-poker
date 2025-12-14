-- Add aggression_level field to profiles for bot players
-- Levels: 'very_conservative', 'conservative', 'normal', 'aggressive', 'very_aggressive'
ALTER TABLE public.profiles 
ADD COLUMN aggression_level text NOT NULL DEFAULT 'normal';

-- Add comment explaining the field
COMMENT ON COLUMN public.profiles.aggression_level IS 'Bot aggression level: very_conservative, conservative, normal, aggressive, very_aggressive';