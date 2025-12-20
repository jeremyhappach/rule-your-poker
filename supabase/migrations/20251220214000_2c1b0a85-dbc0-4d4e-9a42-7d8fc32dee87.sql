-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Players can send chat messages" ON public.chat_messages;

-- Create new policy that allows any authenticated user to send chat messages
-- This enables observers (who aren't in the players table) to chat
CREATE POLICY "Authenticated users can send chat messages" 
ON public.chat_messages 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Also update the SELECT policy to allow observers to view chat
DROP POLICY IF EXISTS "Players can view game chat messages" ON public.chat_messages;

-- Allow any authenticated user to view chat messages for any game
CREATE POLICY "Authenticated users can view game chat messages" 
ON public.chat_messages 
FOR SELECT 
TO authenticated
USING (true);