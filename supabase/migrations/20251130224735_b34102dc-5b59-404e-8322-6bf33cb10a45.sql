-- Add chucky_cards_revealed column to rounds table
ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS chucky_cards_revealed integer DEFAULT 0;