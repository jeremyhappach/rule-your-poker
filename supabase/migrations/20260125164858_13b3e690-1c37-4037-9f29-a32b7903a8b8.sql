-- Add current_game_uuid to games table (regenerated when dealer submits config)
ALTER TABLE public.games
ADD COLUMN current_game_uuid uuid DEFAULT NULL;

-- Add dealer_game_id to game_results for clean grouping
ALTER TABLE public.game_results
ADD COLUMN dealer_game_id uuid DEFAULT NULL;

-- Add index for efficient hand history queries
CREATE INDEX idx_game_results_dealer_game_id ON public.game_results(dealer_game_id);

-- Add comment for documentation
COMMENT ON COLUMN public.games.current_game_uuid IS 'Unique ID for current dealer game within session. Regenerated on each dealer config submit.';
COMMENT ON COLUMN public.game_results.dealer_game_id IS 'References the dealer game this result belongs to. Used for hand history grouping.';