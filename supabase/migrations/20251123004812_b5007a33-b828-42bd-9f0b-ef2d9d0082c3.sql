-- Drop existing restrictive policies on player_cards
DROP POLICY IF EXISTS "Players can view cards after round" ON player_cards;
DROP POLICY IF EXISTS "Players can view own cards" ON player_cards;

-- Create new policies that allow viewing all cards in games where user participates
-- This is needed to show results and determine winners

-- Allow players to view their own cards anytime
CREATE POLICY "Players can view own cards"
ON player_cards FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM players
    WHERE players.id = player_cards.player_id
    AND players.user_id = auth.uid()
  )
);

-- Allow players to view all cards in completed rounds of games they're in
CREATE POLICY "Players can view all cards in completed rounds"
ON player_cards FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM rounds
    JOIN players ON players.game_id = rounds.game_id
    WHERE rounds.id = player_cards.round_id
    AND rounds.status = 'completed'
    AND players.user_id = auth.uid()
  )
);