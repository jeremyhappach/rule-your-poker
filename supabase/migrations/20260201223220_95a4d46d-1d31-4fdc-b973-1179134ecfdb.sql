-- Add cribbage_state JSONB column to rounds table for cribbage game state
-- This will store: scores, pegging state, hands, crib, cut card, game phase, etc.
ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS cribbage_state jsonb DEFAULT NULL;

-- Add index for efficient queries on cribbage games
CREATE INDEX IF NOT EXISTS idx_rounds_cribbage_state 
ON public.rounds USING gin (cribbage_state) 
WHERE cribbage_state IS NOT NULL;

-- Insert cribbage game defaults
INSERT INTO public.game_defaults (game_type, ante_amount, leg_value, legs_to_win, pussy_tax_enabled, pussy_tax_value, pot_max_enabled, pot_max_value, chucky_cards, rabbit_hunt, reveal_at_showdown)
VALUES ('cribbage', 5, 0, 0, false, 0, false, 0, 0, false, false)
ON CONFLICT (game_type) DO NOTHING;

COMMENT ON COLUMN public.rounds.cribbage_state IS 'Cribbage game state: scores, hands, crib, pegging, phase, etc.';