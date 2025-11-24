-- Update the players INSERT policy to allow bot player creation
DROP POLICY IF EXISTS "Users can insert themselves as players" ON public.players;

CREATE POLICY "Users can insert themselves or bots as players" 
ON public.players 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id OR is_bot = true
);