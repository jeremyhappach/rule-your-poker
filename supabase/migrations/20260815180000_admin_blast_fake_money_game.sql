-- Permanently remove one fake-money smoke-test session. The database owns the
-- authorization and money-mode guard; client visibility is only a convenience.
CREATE OR REPLACE FUNCTION public.admin_blast_fake_money_game(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'not authorized';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'already-deleted',
      'deleted', false
    );
  END IF;

  IF v_game.real_money IS NOT FALSE THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'only fake-money games can be blasted';
  END IF;

  -- This archive intentionally has no game foreign key, so it is the only
  -- session artifact that does not disappear through the games-row cascade.
  DELETE FROM public.cribbage_hand_archive
   WHERE game_id = p_game_id;

  -- The games row owns the rest of the session graph: players, dealer games,
  -- rounds, results, snapshots, chat, transfer batches, and private watches.
  DELETE FROM public.games
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'deleted',
    'deleted', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_blast_fake_money_game(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_blast_fake_money_game(uuid) TO authenticated;
