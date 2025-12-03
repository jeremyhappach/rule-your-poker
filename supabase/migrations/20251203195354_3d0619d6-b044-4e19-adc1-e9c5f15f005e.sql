-- Drop existing policy and create expanded one
DROP POLICY IF EXISTS "Observers can view exposed cards" ON player_cards;

-- Allow authenticated users to view cards when round is completed OR all decisions are in (showdown phase)
CREATE POLICY "Observers can view exposed cards" 
ON player_cards 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM rounds r
    JOIN games g ON g.id = r.game_id
    WHERE r.id = player_cards.round_id 
    AND (
      r.status = 'completed'
      OR g.all_decisions_in = true
    )
  )
);