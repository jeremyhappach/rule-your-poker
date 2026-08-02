
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view game chat messages" ON public.chat_messages;

-- New SELECT policy: user must be a current player in the game OR have a session_player_snapshot for that game
CREATE POLICY "Participants can view game chat messages"
ON public.chat_messages
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Currently in the game as a player
    EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.game_id = chat_messages.game_id
        AND p.user_id = auth.uid()
    )
    OR
    -- Played in the session (has snapshots)
    EXISTS (
      SELECT 1 FROM public.session_player_snapshots s
      WHERE s.game_id = chat_messages.game_id
        AND s.user_id = auth.uid()
    )
  )
);
