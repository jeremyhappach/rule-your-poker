-- Drop the problematic policy
DROP POLICY IF EXISTS "Players can view game participants" ON players;

-- Create a security definer function to check if user is in a game
CREATE OR REPLACE FUNCTION public.user_is_in_game(game_id_param uuid)
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

-- Create the policy using the security definer function
CREATE POLICY "Players can view game participants"
ON players FOR SELECT
USING (public.user_is_in_game(game_id));