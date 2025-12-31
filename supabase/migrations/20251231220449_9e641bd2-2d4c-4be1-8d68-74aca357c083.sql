-- Atomic claim for Horses bot controller to prevent multi-client bot turn fights
-- Stores botControllerUserId in rounds.horses_state (jsonb) only if currently unset.

CREATE OR REPLACE FUNCTION public.claim_horses_bot_controller(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_state jsonb;
BEGIN
  -- Only allow users who are currently in the game to claim.
  UPDATE public.rounds r
  SET horses_state = jsonb_set(
    COALESCE(r.horses_state, '{}'::jsonb),
    '{botControllerUserId}',
    to_jsonb(auth.uid()::text),
    true
  )
  WHERE r.id = _round_id
    AND (r.horses_state->>'botControllerUserId') IS NULL
    AND public.user_is_in_game(r.game_id);

  SELECT r.horses_state
  INTO claimed_state
  FROM public.rounds r
  WHERE r.id = _round_id;

  RETURN claimed_state;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_horses_bot_controller(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_horses_bot_controller(uuid) TO authenticated;