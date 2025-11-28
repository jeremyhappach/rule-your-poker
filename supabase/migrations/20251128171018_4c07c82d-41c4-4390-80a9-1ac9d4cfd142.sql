-- Add configurable game parameters
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS ante_amount integer DEFAULT 2 NOT NULL,
ADD COLUMN IF NOT EXISTS leg_value integer DEFAULT 1 NOT NULL,
ADD COLUMN IF NOT EXISTS pussy_tax_enabled boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS pussy_tax_value integer DEFAULT 1 NOT NULL,
ADD COLUMN IF NOT EXISTS legs_to_win integer DEFAULT 3 NOT NULL,
ADD COLUMN IF NOT EXISTS pot_max_enabled boolean DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS pot_max_value integer DEFAULT 10 NOT NULL,
ADD COLUMN IF NOT EXISTS config_complete boolean DEFAULT false NOT NULL;

-- Update dealer_position to have a default value for existing games
UPDATE public.games SET dealer_position = 1 WHERE dealer_position IS NULL;