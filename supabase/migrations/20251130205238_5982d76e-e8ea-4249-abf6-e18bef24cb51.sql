-- Update the cards_dealt constraint to support Holm game (4 cards) and future game types
ALTER TABLE public.rounds 
DROP CONSTRAINT IF EXISTS rounds_cards_dealt_check;

-- Add new constraint allowing 2-7 cards for various game types
ALTER TABLE public.rounds 
ADD CONSTRAINT rounds_cards_dealt_check 
CHECK (cards_dealt >= 2 AND cards_dealt <= 7);