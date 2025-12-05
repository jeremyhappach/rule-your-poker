-- Add game configuration defaults to game_defaults table
ALTER TABLE public.game_defaults
ADD COLUMN IF NOT EXISTS ante_amount integer NOT NULL DEFAULT 2,
ADD COLUMN IF NOT EXISTS pot_max_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS pot_max_value integer NOT NULL DEFAULT 10,
ADD COLUMN IF NOT EXISTS chucky_cards integer NOT NULL DEFAULT 4,
ADD COLUMN IF NOT EXISTS leg_value integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS legs_to_win integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS pussy_tax_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS pussy_tax_value integer NOT NULL DEFAULT 1;