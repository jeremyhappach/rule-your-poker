
-- Add dealer_game_id to rounds table for direct matching
ALTER TABLE rounds 
ADD COLUMN dealer_game_id uuid REFERENCES dealer_games(id);

-- Create index for fast lookups
CREATE INDEX idx_rounds_dealer_game_id ON rounds(dealer_game_id);

-- Add comment explaining the relationship
COMMENT ON COLUMN rounds.dealer_game_id IS 'Links this round to the specific dealer game configuration it belongs to. This allows direct matching between rounds and game_results without timestamp logic.';
