-- Allow users to delete their own player record
CREATE POLICY "Users can delete own player record" 
ON public.players 
FOR DELETE 
USING (auth.uid() = user_id);