-- Fix RLS policy for players table to allow viewing players in the same game
DROP POLICY IF EXISTS "Anyone can view players" ON players;

-- Allow players to view other players in games they're participating in
CREATE POLICY "Players can view game participants"
ON players FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM players p2
    WHERE p2.game_id = players.game_id
    AND p2.user_id = auth.uid()
  )
);