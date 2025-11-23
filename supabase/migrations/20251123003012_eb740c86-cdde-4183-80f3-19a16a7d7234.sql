-- Drop the problematic policy
DROP POLICY IF EXISTS "Players can view game participants" ON players;

-- Create security definer function to check if user is in a game
CREATE OR REPLACE FUNCTION public.user_in_game(game_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.players
    WHERE game_id = game_id_param
    AND user_id = auth.uid()
  )
$$;

-- Create new policy using the security definer function
CREATE POLICY "Players can view game participants"
ON players FOR SELECT
USING (
  -- Allow viewing own player record
  user_id = auth.uid()
  OR
  -- Allow viewing other players in waiting games (lobby)
  EXISTS (
    SELECT 1 FROM games
    WHERE games.id = players.game_id
    AND games.status = 'waiting'
  )
  OR
  -- Allow viewing other players in games where user is a participant
  public.user_in_game(game_id)
);