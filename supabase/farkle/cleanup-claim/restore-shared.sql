-- Executable forward recovery: restore the exact qualified shared admin-blast owner.
-- No Farkle data, receipts, or history are removed.
DO $drift$ BEGIN
 IF md5(pg_get_functiondef('public.admin_blast_fake_money_game(uuid)'::regprocedure))
   <> '06c2cedb3ef0b85485b0281f24f8cfcf'
 THEN RAISE EXCEPTION 'farkle:admin_blast_recovery_drift'; END IF;
END $drift$;

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

;


DO $verify$ BEGIN
 IF md5(pg_get_functiondef('public.admin_blast_fake_money_game(uuid)'::regprocedure))
   <> 'a4a9a9e1d7ad5c8297d2b32431f2ed24'
 THEN RAISE EXCEPTION 'farkle:admin_blast_recovery_mismatch'; END IF;
END $verify$;
