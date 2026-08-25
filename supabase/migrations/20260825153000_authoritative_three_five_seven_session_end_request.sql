-- Route 3-5-7 LAST HAND through the same locked database authority as the
-- dealer game's decisions and settlement. Direct browser mutation is rejected
-- by the 3-5-7 game-authority guard and must never fail silently.
CREATE OR REPLACE FUNCTION public.three_five_seven_request_session_end(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_game public.games%ROWTYPE;
  v_terminal_award_exists boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'three_five_seven_request_session_end:authentication_required';
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = p_game_id
   FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('3-5-7', '3-5-7-game', '357') THEN
    RAISE EXCEPTION 'three_five_seven_request_session_end:not_357_game';
  END IF;

  IF v_game.current_host IS DISTINCT FROM v_actor_id
     OR NOT EXISTS (
       SELECT 1
         FROM public.players participant
        WHERE participant.game_id = p_game_id
          AND participant.user_id = v_actor_id
          AND participant.status = 'active'
          AND coalesce(participant.is_bot, false) = false
     ) THEN
    RAISE EXCEPTION 'three_five_seven_request_session_end:not_active_human_host';
  END IF;

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'request_recorded', true,
      'terminal_disposition', 'session_ended',
      'already_terminal', true
    );
  END IF;

  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  IF v_game.status IN ('waiting', 'waiting_for_players', 'dealer_selection',
                       'game_selection', 'configuring') THEN
    UPDATE public.games
       SET status = 'session_ended',
           session_ended_at = coalesce(session_ended_at, clock_timestamp()),
           game_over_at = coalesce(game_over_at, clock_timestamp()),
           pending_session_end = false
     WHERE id = p_game_id;

    RETURN jsonb_build_object(
      'request_recorded', true,
      'terminal_disposition', 'session_ended',
      'immediate', true
    );
  END IF;

  IF v_game.status = 'game_over' THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.game_results result
       WHERE result.game_id = p_game_id
         AND result.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
         AND result.hand_number IS NOT DISTINCT FROM v_game.total_hands
         AND result.settlement_key = 'three_five_seven_terminal'
    ) INTO v_terminal_award_exists;

    IF NOT v_terminal_award_exists THEN
      RAISE EXCEPTION 'three_five_seven_request_session_end:terminal_award_missing';
    END IF;

    UPDATE public.games
       SET status = 'session_ended',
           session_ended_at = coalesce(session_ended_at, clock_timestamp()),
           pending_session_end = false
     WHERE id = p_game_id;

    RETURN jsonb_build_object(
      'request_recorded', true,
      'terminal_disposition', 'session_ended',
      'late_terminal_repair', true
    );
  END IF;

  IF v_game.status NOT IN ('ante_decision', 'in_progress') THEN
    RAISE EXCEPTION 'three_five_seven_request_session_end:invalid_status:%', v_game.status;
  END IF;

  UPDATE public.games
     SET pending_session_end = true
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'request_recorded', true,
    'terminal_disposition', 'pending_session_end',
    'late_terminal_repair', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.three_five_seven_request_session_end(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.three_five_seven_request_session_end(uuid) TO authenticated;
