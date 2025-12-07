-- Create chat_messages table for game chat
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Players in the game can view messages
CREATE POLICY "Players can view game chat messages" 
ON public.chat_messages 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM players
    WHERE players.game_id = chat_messages.game_id
    AND players.user_id = auth.uid()
  )
);

-- Players can send messages to their game
CREATE POLICY "Players can send chat messages" 
ON public.chat_messages 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM players
    WHERE players.game_id = chat_messages.game_id
    AND players.user_id = auth.uid()
  )
);

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Create index for faster queries
CREATE INDEX idx_chat_messages_game_id ON public.chat_messages(game_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at DESC);