
-- Update the "Observers can view exposed cards" policy to include 'processing' and 'showdown' statuses
-- These statuses only exist AFTER all decisions are locked, so visibility is safe
-- This fixes the timing issue where all_decisions_in may not be true when cards are fetched
DROP POLICY IF EXISTS "Observers can view exposed cards" ON public.player_cards;

CREATE POLICY "Observers can view exposed cards" 
ON public.player_cards 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM rounds r
    JOIN games g ON g.id = r.game_id
    WHERE r.id = player_cards.round_id 
    AND (
      r.status = 'completed'
      OR r.status = 'processing'
      OR r.status = 'showdown'
      OR g.all_decisions_in = true
    )
  )
);
