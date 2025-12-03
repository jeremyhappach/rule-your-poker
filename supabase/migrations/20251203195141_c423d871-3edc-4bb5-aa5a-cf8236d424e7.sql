-- Drop the existing observer policy and create a better one
DROP POLICY IF EXISTS "Observers can view cards in completed rounds" ON player_cards;

-- Allow any authenticated user to view cards when the round is completed OR when players have folded/stayed (cards exposed)
CREATE POLICY "Observers can view exposed cards" 
ON player_cards 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND (
    -- Round is completed - all cards should be visible
    EXISTS (
      SELECT 1 FROM rounds 
      WHERE rounds.id = player_cards.round_id 
      AND rounds.status = 'completed'
    )
  )
);