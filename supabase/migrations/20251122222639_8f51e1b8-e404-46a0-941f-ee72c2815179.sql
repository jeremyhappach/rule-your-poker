-- Allow users to delete games they created (first player in the game)
CREATE POLICY "Game creators can delete games"
ON games
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM players
    WHERE players.game_id = games.id
    AND players.user_id = auth.uid()
    AND players.position = 1
  )
);