-- Holm deadline enforcement is allowed to submit exactly one expired turn, but
-- it must never fabricate a showdown, settle chips, or advance a completed
-- hand.  This service-only adapter locks the exact hand/turn identity and then
-- delegates to the same replay-safe decision/settlement path used by a player.

CREATE OR REPLACE FUNCTION public.holm_apply_deadline_decision(
  p_game_id uuid,
  p_round_id uuid,
  p_player_id uuid,
  p_decision text,
  p_mark_auto_fold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_round public.rounds%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_result jsonb;
  v_next_turn_position integer;
  v_timer_seconds integer;
BEGIN
  IF p_decision NOT IN ('stay', 'fold') THEN
    RAISE EXCEPTION 'holm_apply_deadline_decision:invalid_decision';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_apply_deadline_decision:not_holm_game';
  END IF;

  IF v_game.status IN ('game_over', 'session_ended') THEN
    RETURN jsonb_build_object('already_terminal', true, 'status', v_game.status);
  END IF;

  SELECT * INTO v_round
  FROM public.rounds
  WHERE game_id = p_game_id
    AND dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
  ORDER BY hand_number DESC NULLS LAST, round_number DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND OR v_round.id IS DISTINCT FROM p_round_id THEN
    RETURN jsonb_build_object('stale_round', true);
  END IF;

  IF v_round.status <> 'betting' THEN
    RETURN jsonb_build_object('round_not_betting', true, 'round_status', v_round.status);
  END IF;

  IF v_round.decision_deadline IS NULL OR v_round.decision_deadline > now() THEN
    RETURN jsonb_build_object('deadline_not_expired', true);
  END IF;

  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id
    AND game_id = p_game_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_player.status <> 'active'
     OR coalesce(v_player.sitting_out, false) THEN
    RETURN jsonb_build_object('player_not_eligible', true);
  END IF;

  IF v_player.position IS DISTINCT FROM v_round.current_turn_position THEN
    RETURN jsonb_build_object('not_current_turn', true);
  END IF;

  IF v_player.decision_locked THEN
    RETURN jsonb_build_object('already_locked', true);
  END IF;

  -- holm_submit_decision intentionally performs its normal participant and
  -- player-identity checks.  The service adapter supplies this exact player
  -- identity only inside its transaction; the function itself is not callable
  -- by browser roles (grants below).
  IF v_player.user_id IS NULL THEN
    RETURN jsonb_build_object('deadline_actor_unavailable', true);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_player.user_id::text, true);

  SELECT public.holm_submit_decision(p_game_id, p_player_id, p_decision)
  INTO v_result;

  IF p_mark_auto_fold
     AND p_decision = 'fold'
     AND coalesce((v_result->>'decision_locked')::boolean, false) THEN
    UPDATE public.players
       SET auto_fold = true,
           sit_out_next_hand = true
     WHERE id = p_player_id
       AND game_id = p_game_id;
  END IF;

  -- holm_submit_decision owns the terminal branches and clears the turn when
  -- every player has decided.  While decisions remain, advance only the
  -- current-turn pointer within this same locked hand; no settlement is made.
  IF NOT coalesce((v_result->>'all_decisions_in')::boolean, false) THEN
    SELECT position INTO v_next_turn_position
    FROM public.players
    WHERE game_id = p_game_id
      AND status = 'active'
      AND sitting_out = false
      AND decision_locked = false
    ORDER BY
      CASE WHEN position < v_player.position THEN 0 ELSE 1 END,
      position DESC
    LIMIT 1;

    IF v_next_turn_position IS NOT NULL THEN
      SELECT coalesce(decision_timer_seconds, 30)
      INTO v_timer_seconds
      FROM public.game_defaults
      WHERE game_type = 'holm'
      LIMIT 1;

      UPDATE public.rounds
         SET current_turn_position = v_next_turn_position,
             decision_deadline = now() + make_interval(secs => coalesce(v_timer_seconds, 30))
       WHERE id = v_round.id
         AND status = 'betting'
         AND current_turn_position = v_player.position;
    END IF;
  END IF;

  RETURN coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'deadline_applied', true,
    'round_id', v_round.id,
    'player_id', p_player_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) TO service_role;

COMMENT ON FUNCTION public.holm_apply_deadline_decision(uuid, uuid, uuid, text, boolean) IS
  'Service-only expired-turn adapter. Delegates Holm settlement to holm_submit_decision and never completes a client-owned showdown.';
