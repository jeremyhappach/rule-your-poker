-- Drop the old restrictive check constraint and replace with one that allows all game types
ALTER TABLE public.rounds DROP CONSTRAINT rounds_cards_dealt_check;
ALTER TABLE public.rounds ADD CONSTRAINT rounds_cards_dealt_check CHECK (cards_dealt >= 0 AND cards_dealt <= 52);