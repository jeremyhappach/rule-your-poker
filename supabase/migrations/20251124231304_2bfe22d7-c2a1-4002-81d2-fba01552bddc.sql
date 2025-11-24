-- Add DELETE policy for rounds table to allow game cleanup
CREATE POLICY "Anyone can delete rounds"
ON public.rounds
FOR DELETE
USING (true);

-- Add DELETE policy for player_cards table to allow game cleanup  
CREATE POLICY "Anyone can delete player cards"
ON public.player_cards
FOR DELETE
USING (true);