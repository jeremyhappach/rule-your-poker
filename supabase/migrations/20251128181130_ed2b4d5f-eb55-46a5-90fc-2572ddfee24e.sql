-- TEMPORARY: Allow viewing all player cards for testing hand evaluation
-- This policy allows players to see all cards in active rounds (not just their own or completed rounds)
-- Remove this policy later when testing is complete

DROP POLICY IF EXISTS "TEMP: Players can view all cards for testing" ON player_cards;

CREATE POLICY "TEMP: Players can view all cards for testing"
ON player_cards
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM rounds
    JOIN players ON players.game_id = rounds.game_id
    WHERE rounds.id = player_cards.round_id
    AND players.user_id = auth.uid()
  )
);