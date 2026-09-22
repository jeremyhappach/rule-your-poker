-- Farkle-only authority for the existing admin fake-money blast cascade.
-- The prior shared definition is preserved in the paired forward-recovery SQL.
DO $drift$ BEGIN
  IF md5(pg_get_functiondef('public.admin_blast_fake_money_game(uuid)'::regprocedure))
       <> 'a4a9a9e1d7ad5c8297d2b32431f2ed24'
     OR (SELECT pg_get_userbyid(proowner) FROM pg_proc
         WHERE oid='public.admin_blast_fake_money_game(uuid)'::regprocedure) <> 'postgres'
     OR NOT (SELECT prosecdef FROM pg_proc
         WHERE oid='public.admin_blast_fake_money_game(uuid)'::regprocedure)
     OR NOT has_function_privilege('authenticated',
         'public.admin_blast_fake_money_game(uuid)'::regprocedure,'EXECUTE')
     OR has_function_privilege('anon',
         'public.admin_blast_fake_money_game(uuid)'::regprocedure,'EXECUTE')
  THEN RAISE EXCEPTION 'farkle:admin_blast_owner_drift'; END IF;
END $drift$;

CREATE OR REPLACE FUNCTION public.admin_blast_fake_money_game(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_has_farkle boolean;
  v_prior_farkle_claim text;
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

  -- A completed Farkle dealer game remains in this session's cascade even
  -- after canonical continuation clears games.game_type/current_game_uuid.
  SELECT v_game.game_type = 'farkle' OR EXISTS (
    SELECT 1 FROM public.dealer_games
     WHERE session_id = p_game_id AND game_type = 'farkle'
  ) INTO v_has_farkle;
  IF v_has_farkle THEN
    v_prior_farkle_claim := coalesce(current_setting('app.farkle_authority', true), '');
    PERFORM private.farkle_claim_v1(p_game_id, NULL, NULL, 'cleanup');
  END IF;

  -- This archive intentionally has no game foreign key, so it is the only
  -- session artifact that does not disappear through the games-row cascade.
  DELETE FROM public.cribbage_hand_archive
   WHERE game_id = p_game_id;

  -- The games row owns the rest of the session graph: players, dealer games,
  -- rounds, results, snapshots, chat, transfer batches, and private watches.
  DELETE FROM public.games
   WHERE id = p_game_id;

  IF v_has_farkle THEN
    PERFORM set_config('app.farkle_authority', v_prior_farkle_claim, true);
  END IF;
  RETURN jsonb_build_object(
    'outcome', 'deleted',
    'deleted', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_blast_fake_money_game(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_blast_fake_money_game(uuid) TO authenticated;
