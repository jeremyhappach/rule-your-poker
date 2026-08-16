-- Keep Cribbage dealer-selection entry and its first-hand recovery inside one
-- database transaction. The authority cutover referenced jsonb_object_length,
-- which PostgreSQL does not provide, so the scheduled recovery owner aborted
-- and rolled back every attempted first-hand bootstrap.

CREATE OR REPLACE FUNCTION private.jsonb_object_length(_value jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT count(*)::integer
    FROM jsonb_object_keys(_value);
$$;

REVOKE ALL ON FUNCTION private.jsonb_object_length(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.jsonb_object_length(jsonb) TO service_role;

COMMENT ON FUNCTION private.jsonb_object_length(jsonb) IS
  'Counts JSON object members for the private Cribbage recovery owner; PostgreSQL has no built-in jsonb_object_length.';

CREATE OR REPLACE FUNCTION public.cribbage_begin_dealer_selection(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_actor_id uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'cribbage_begin_dealer_selection:authentication_required';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = _game_id
   FOR UPDATE;

  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'cribbage_begin_dealer_selection:not_cribbage_game';
  END IF;

  IF NOT v_is_service
     AND NOT public.user_is_in_game(_game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'cribbage_begin_dealer_selection:not_in_session';
  END IF;

  IF v_game.status = 'cribbage_dealer_selection' THEN
    RETURN public.cribbage_prepare_dealer_selection(_game_id);
  END IF;

  IF v_game.status IS DISTINCT FROM 'ante_decision' THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'wrong_status',
      'status', v_game.status
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.players participant
     WHERE participant.game_id = _game_id
       AND NOT coalesce(participant.sitting_out, false)
       AND participant.status NOT IN ('observer', 'left')
       AND participant.ante_decision IS NULL
  ) THEN
    RETURN jsonb_build_object(
      'outcome', 'rejected',
      'reason', 'waiting_for_antes',
      'status', v_game.status
    );
  END IF;

  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games
     SET status = 'cribbage_dealer_selection',
         dealer_selection_state = NULL
   WHERE id = _game_id;

  RETURN public.cribbage_prepare_dealer_selection(_game_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_begin_dealer_selection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_begin_dealer_selection(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cribbage_begin_dealer_selection(uuid) IS
  'Atomically validates completed antes, enters Cribbage dealer selection, and publishes one replay-safe dealer result.';
