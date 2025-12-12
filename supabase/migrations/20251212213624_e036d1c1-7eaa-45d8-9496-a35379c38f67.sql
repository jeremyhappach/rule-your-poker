-- Create atomic function to decrement player chips (prevents race conditions / double charges)
CREATE OR REPLACE FUNCTION public.decrement_player_chips(player_ids uuid[], amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.players
  SET chips = chips - amount
  WHERE id = ANY(player_ids);
END;
$$;