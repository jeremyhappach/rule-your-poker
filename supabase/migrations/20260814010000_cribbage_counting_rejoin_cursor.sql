-- Counting presentation is shared, but browsers are not authoritative state
-- writers. Persist only a forward cursor inside the existing counted hand so
-- a refresh can rejoin without replacing score truth or its release lease.

CREATE OR REPLACE FUNCTION public.cribbage_record_counting_progress(
  _round_id uuid,
  _target_index integer,
  _beat_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_plan jsonb;
  v_target_count integer;
  v_target_combo_count integer;
  v_current_target_index integer;
  v_current_beat_index integer;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF _round_id IS NULL THEN
    RAISE EXCEPTION 'cribbage_record_counting_progress:round_required';
  END IF;
  IF _target_index IS NULL OR _target_index < 0
     OR _beat_index IS NULL OR _beat_index < -1 THEN
    RAISE EXCEPTION 'cribbage_record_counting_progress:invalid_cursor';
  END IF;

  -- Preserve the canonical predecessor-then-game lock order used by the
  -- counting finalization and release owners.
  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = _round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cribbage_record_counting_progress:round_not_found:%', _round_id;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = v_round.game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'cribbage_record_counting_progress:not_cribbage_round';
  END IF;
  IF NOT v_is_service_role
     AND (v_actor_id IS NULL
       OR (NOT public.user_is_in_game(v_round.game_id)
           AND NOT public.has_role(v_actor_id, 'admin'::public.app_role))) THEN
    RAISE EXCEPTION 'cribbage_record_counting_progress:caller_not_in_session';
  END IF;

  v_state := v_round.cribbage_state;
  IF v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_round.status IS DISTINCT FROM 'betting'
     OR coalesce(v_game.is_paused, false)
     OR v_state IS NULL
     OR jsonb_typeof(v_state) <> 'object'
     OR v_state ->> 'phase' IS DISTINCT FROM 'counting' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'round_not_live_counting');
  END IF;

  v_plan := v_state -> 'countingPlan';
  IF jsonb_typeof(v_plan -> 'targets') IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'invalid_counting_plan');
  END IF;
  v_target_count := jsonb_array_length(v_plan -> 'targets');
  IF _target_index >= v_target_count THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'target_out_of_range');
  END IF;
  v_target_combo_count := jsonb_array_length(
    coalesce(v_plan -> 'targets' -> _target_index -> 'comboPoints', '[]'::jsonb)
  );
  IF _beat_index > v_target_combo_count THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'beat_out_of_range');
  END IF;

  v_current_target_index := greatest(
    0,
    coalesce((v_state ->> 'countingTargetIndex')::integer, 0)
  );
  v_current_beat_index := coalesce((v_state ->> 'countingBeatIndex')::integer, -1);
  IF _target_index < v_current_target_index
     OR (_target_index = v_current_target_index AND _beat_index <= v_current_beat_index) THEN
    RETURN jsonb_build_object('outcome', 'ignored', 'state', v_state);
  END IF;

  v_state := jsonb_set(v_state, '{countingTargetIndex}', to_jsonb(_target_index), true);
  v_state := jsonb_set(v_state, '{countingBeatIndex}', to_jsonb(_beat_index), true);
  UPDATE public.rounds
     SET cribbage_state = v_state
   WHERE id = v_round.id;

  RETURN jsonb_build_object('outcome', 'advanced', 'state', v_state);
END;
$$;

REVOKE ALL ON FUNCTION public.cribbage_record_counting_progress(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cribbage_record_counting_progress(uuid, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.cribbage_record_counting_progress(uuid, integer, integer) IS
  'Advances only the active Cribbage counting presentation cursor without replacing scoring truth, resolution, or the release lease.';
