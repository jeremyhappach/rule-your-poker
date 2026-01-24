-- Add a column to store dealer selection state for realtime sync across all players
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS dealer_selection_state jsonb DEFAULT NULL;

-- Structure will be:
-- {
--   cards: [{playerId, position, card: {rank, suit}, isRevealed, isWinner, isDimmed, roundNumber}],
--   announcement: string | null,
--   isComplete: boolean,
--   winnerPosition: number | null
-- }

COMMENT ON COLUMN public.games.dealer_selection_state IS 'Stores high-card dealer selection state for realtime sync to all players';