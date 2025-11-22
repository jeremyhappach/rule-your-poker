-- Add player_cards table to store dealt cards
CREATE TABLE IF NOT EXISTS public.player_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add current player tracking and betting to games table
ALTER TABLE public.games 
  ADD COLUMN IF NOT EXISTS current_player_position INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_bet INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dealer_position INTEGER DEFAULT 1;

-- Enable RLS on player_cards
ALTER TABLE public.player_cards ENABLE ROW LEVEL SECURITY;

-- Players can view their own cards
CREATE POLICY "Players can view own cards" 
ON public.player_cards 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.players 
    WHERE players.id = player_cards.player_id 
    AND players.user_id = auth.uid()
  )
);

-- Players can view cards in their game after round ends
CREATE POLICY "Players can view cards after round" 
ON public.player_cards 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.rounds
    JOIN public.players ON players.game_id = rounds.game_id
    WHERE rounds.id = player_cards.round_id
    AND rounds.status = 'completed'
    AND players.user_id = auth.uid()
  )
);

-- System can insert cards (handled by authenticated users)
CREATE POLICY "Anyone can insert cards" 
ON public.player_cards 
FOR INSERT 
WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_cards_player ON public.player_cards(player_id);
CREATE INDEX IF NOT EXISTS idx_player_cards_round ON public.player_cards(round_id);