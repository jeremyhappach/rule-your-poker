-- Create chip_stack_emoticons table for temporary emoticon overlays on player chipstacks
CREATE TABLE public.chip_stack_emoticons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  emoticon TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chip_stack_emoticons ENABLE ROW LEVEL SECURITY;

-- Players in the game can view all emoticons for that game
CREATE POLICY "Players can view game emoticons"
ON public.chip_stack_emoticons
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.players
    WHERE players.game_id = chip_stack_emoticons.game_id
    AND players.user_id = auth.uid()
  )
);

-- Players can insert emoticons for themselves
CREATE POLICY "Players can insert own emoticons"
ON public.chip_stack_emoticons
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.players
    WHERE players.id = chip_stack_emoticons.player_id
    AND players.user_id = auth.uid()
  )
);

-- Players can delete their own expired emoticons (cleanup)
CREATE POLICY "Players can delete own emoticons"
ON public.chip_stack_emoticons
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.players
    WHERE players.id = chip_stack_emoticons.player_id
    AND players.user_id = auth.uid()
  )
);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chip_stack_emoticons;