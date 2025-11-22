-- Drop the old policy
DROP POLICY IF EXISTS "Game creators can delete games" ON games;

-- Allow users to delete games they created OR games with no players
CREATE POLICY "Users can delete own games or empty games"
ON games
FOR DELETE
USING (
  -- Either the user created the game
  EXISTS (
    SELECT 1 FROM players
    WHERE players.game_id = games.id
    AND players.user_id = auth.uid()
    AND players.position = 1
  )
  OR
  -- Or the game has no players
  NOT EXISTS (
    SELECT 1 FROM players
    WHERE players.game_id = games.id
  )
);