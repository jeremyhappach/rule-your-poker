-- Create atomic increment function to prevent race conditions when awarding pot
CREATE OR REPLACE FUNCTION public.increment_player_chips(p_player_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_chips integer;
BEGIN
  UPDATE public.players
  SET chips = chips + p_amount
  WHERE id = p_player_id
  RETURNING chips INTO new_chips;
  
  RETURN new_chips;
END;
$$;