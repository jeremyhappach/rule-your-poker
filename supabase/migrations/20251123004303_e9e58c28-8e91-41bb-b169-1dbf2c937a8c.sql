-- Drop the restrictive players view policy
DROP POLICY IF EXISTS "Players can view game participants" ON players;

-- Create a more permissive policy that allows anyone to view players in any game
-- This allows spectating and invited players to see the game state
CREATE POLICY "Anyone can view players"
ON players FOR SELECT
USING (true);

-- Also ensure games are viewable by everyone
DROP POLICY IF EXISTS "Anyone can view games" ON games;

CREATE POLICY "Anyone can view games"
ON games FOR SELECT
USING (true);