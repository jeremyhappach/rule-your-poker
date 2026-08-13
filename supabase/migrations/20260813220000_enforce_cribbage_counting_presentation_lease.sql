-- A prepared Cribbage successor is deliberately non-actionable until the
-- stored counting presentation has reached its release point.  This protects
-- the table from a stale tab (or an early client callback) skipping the count.
CREATE OR REPLACE FUNCTION public.activate_prepared_cribbage_hand(
  p_game_id uuid,
  p_predecessor_round_id uuid,
  p_successor_round_id uuid,
  p_from_fallback boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_predecessor public.rounds%ROWTYPE;
  v_successor public.rounds%ROWTYPE;
  v_presentation_release_at timestamptz;
  v_actor_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF v_actor_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:authentication_required';
  END IF;
  IF p_from_fallback AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:fallback_requires_service_role';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'cribbage' THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:not_cribbage_game';
  END IF;
  IF NOT v_is_service_role
     AND NOT public.user_is_in_game(p_game_id)
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'activate_prepared_cribbage_hand:caller_not_in_session';
  END IF;

  SELECT * INTO v_predecessor
    FROM public.rounds
   WHERE id = p_predecessor_round_id
     AND game_id = p_game_id
     AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
   FOR UPDATE;
  SELECT * INTO v_successor
    FROM public.rounds
   WHERE id = p_successor_round_id
     AND game_id = p_game_id
     AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
     AND predecessor_round_id = p_predecessor_round_id
   FOR UPDATE;

  IF v_predecessor.id IS NULL OR v_successor.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'stale_identity');
  END IF;
  IF v_successor.status = 'betting'
     AND v_game.total_hands = v_successor.hand_number THEN
    RETURN jsonb_build_object(
      'outcome', 'already_active',
      'round_id', v_successor.id,
      'hand_number', v_successor.hand_number,
      'deduped', true
    );
  END IF;
  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'terminal_game');
  END IF;
  IF coalesce(v_game.is_paused, false) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'game_paused');
  END IF;
  IF v_predecessor.cribbage_state -> 'countingResolution' ->> 'outcome' IS DISTINCT FROM 'prepared'
     OR v_successor.status IS DISTINCT FROM 'dealing' THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'successor_not_prepared');
  END IF;

  IF p_from_fallback
     AND (v_successor.presentation_fallback_at IS NULL
       OR v_successor.presentation_fallback_at > clock_timestamp()) THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'fallback_not_due');
  END IF;

  -- `presentation_fallback_at` is the exact persisted visual timeline plus
  -- five seconds of server-only recovery slack.  Clients may acknowledge the
  -- hand at the release point, while the deadline worker remains the sole
  -- owner of the later fallback.  The timestamp is derived server-side from
  -- the stored counting plan, not from browser time.
  IF NOT p_from_fallback THEN
    IF v_successor.presentation_fallback_at IS NULL THEN
      RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'presentation_lease_missing');
    END IF;
    v_presentation_release_at := v_successor.presentation_fallback_at - interval '5 seconds';
    IF v_presentation_release_at > clock_timestamp() THEN
      RETURN jsonb_build_object(
        'outcome', 'presentation_pending',
        'round_id', v_successor.id,
        'hand_number', v_successor.hand_number,
        'presentation_release_at', v_presentation_release_at,
        'presentation_fallback_at', v_successor.presentation_fallback_at,
        'deduped', true
      );
    END IF;
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = v_predecessor.id
     AND status <> 'completed';

  UPDATE public.rounds
     SET status = 'betting',
         presentation_fallback_at = NULL
   WHERE id = v_successor.id
     AND status = 'dealing';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'activation_compare_and_set_failed');
  END IF;

  UPDATE public.games
     SET status = 'in_progress',
         current_round = 1,
         total_hands = v_successor.hand_number,
         is_first_hand = false,
         pot = 0
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'outcome', 'activated',
    'round_id', v_successor.id,
    'hand_number', v_successor.hand_number,
    'deduped', false,
    'from_fallback', p_from_fallback
  );
END;
$$;

COMMENT ON FUNCTION public.activate_prepared_cribbage_hand(uuid, uuid, uuid, boolean) IS
  'Activates an exact prepared Cribbage successor only after its persisted counting presentation release; service role may recover only after the fallback lease.';
