-- Drop the current policy causing recursion
DROP POLICY IF EXISTS "Players can view game participants" ON players;

-- Allow viewing players only for games in 'waiting' status (lobby view)
-- OR for games the user is participating in
CREATE POLICY "Players can view lobby and own games"
ON players FOR SELECT
USING (
  -- Allow viewing players in waiting games (for lobby)
  EXISTS (
    SELECT 1 FROM games
    WHERE games.id = players.game_id
    AND games.status = 'waiting'
  )
  OR
  -- Allow viewing players in games where the user is a participant
  players.user_id = auth.uid()
);