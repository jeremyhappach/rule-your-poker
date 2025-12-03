-- Allow any authenticated user to view player cards in completed rounds
-- This enables observers to see revealed cards during showdowns
CREATE POLICY "Observers can view cards in completed rounds" 
ON public.player_cards 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM rounds 
    WHERE rounds.id = player_cards.round_id 
    AND rounds.status = 'completed'
  )
  AND auth.uid() IS NOT NULL
);