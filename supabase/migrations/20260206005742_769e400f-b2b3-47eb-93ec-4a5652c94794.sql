-- Add unique constraint on player_cards for (player_id, round_id) to support upsert operations
-- First, remove any existing duplicates (keep the most recent one)
DELETE FROM public.player_cards a
USING public.player_cards b
WHERE a.id < b.id
AND a.player_id = b.player_id
AND a.round_id = b.round_id;

-- Now add the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_cards_player_round_unique 
ON public.player_cards (player_id, round_id);