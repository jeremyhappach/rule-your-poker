-- Drop the current restrictive policy
DROP POLICY IF EXISTS "Players can view lobby and own games" ON players;

-- Create a more permissive policy that allows viewing all players in games where user participates
-- OR in waiting games (for lobby display)
CREATE POLICY "Players can view game participants"
ON players FOR SELECT
USING (
  -- Allow viewing own player record
  user_id = auth.uid()
  OR
  -- Allow viewing other players in waiting games (lobby)
  EXISTS (
    SELECT 1 FROM games
    WHERE games.id = players.game_id
    AND games.status = 'waiting'
  )
  OR
  -- Allow viewing other players in games where user is a participant
  game_id IN (
    SELECT game_id FROM players
    WHERE user_id = auth.uid()
  )
);