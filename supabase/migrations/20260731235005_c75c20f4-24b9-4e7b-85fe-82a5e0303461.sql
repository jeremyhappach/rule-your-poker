ALTER TABLE public.games ADD COLUMN IF NOT EXISTS bot_alias_seq integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.allocate_bot_alias_number(_game_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_max integer;
  _next integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF((regexp_match(pr.username, '^Bot\s+(\d+)'))[1], '')::int), 0)
    INTO _existing_max
  FROM public.players pl
  JOIN public.profiles pr ON pr.id = pl.user_id
  WHERE pl.game_id = _game_id
    AND pl.is_bot = true;

  UPDATE public.games
     SET bot_alias_seq = GREATEST(COALESCE(bot_alias_seq, 0), COALESCE(_existing_max, 0)) + 1
   WHERE id = _game_id
  RETURNING bot_alias_seq INTO _next;

  IF _next IS NULL THEN
    RAISE EXCEPTION 'Game % not found', _game_id;
  END IF;

  RETURN _next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_bot_alias_number(uuid) TO authenticated, service_role;