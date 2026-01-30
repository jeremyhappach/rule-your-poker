-- Add visible_to_user_ids column to player_cards table
-- This column stores which users can see these cards in the hand history
-- NULL means cards are private (only the owner can see), empty array means no one can see,
-- and populated array means those specific user_ids can see the cards

ALTER TABLE public.player_cards 
ADD COLUMN IF NOT EXISTS visible_to_user_ids UUID[] DEFAULT NULL;

-- Add an index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_player_cards_visible_to_user_ids 
ON public.player_cards USING GIN (visible_to_user_ids);

-- Add comment for documentation
COMMENT ON COLUMN public.player_cards.visible_to_user_ids IS 'Array of user_ids who can see these cards in hand history. NULL = private (owner only), populated = those users can see.';