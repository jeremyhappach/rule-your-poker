
-- Add is_public column to player_cards to mark cards that were exposed to the entire table
-- This is used for Holm showdowns where cards are "tabled" and visible to everyone
ALTER TABLE public.player_cards
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.player_cards.is_public IS 'When true, these cards are visible to all viewers (exposed/tabled during showdown)';
