-- LAST HAND must share the games-row lock with Holm's final-decision RPC.
-- The request is idempotent and can also repair the narrow race where a
-- chucky_final_award already committed as game_over before the request arrived.
CREATE OR REPLACE FUNCTION public.holm_request_session_end(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_terminal_award_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'holm_request_session_end:authentication_required';
  END IF;

  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND OR v_game.game_type NOT IN ('holm', 'holm-game') THEN
    RAISE EXCEPTION 'holm_request_session_end:not_holm_game';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.players participant
    WHERE participant.game_id = p_game_id
      AND participant.user_id = auth.uid()
      AND participant.status = 'active'
      AND coalesce(participant.is_bot, false) = false
  ) THEN
    RAISE EXCEPTION 'holm_request_session_end:not_active_human_participant';
  END IF;

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'request_recorded', true,
      'terminal_disposition', 'session_ended',
      'already_terminal', true
    );
  END IF;

  -- If final settlement won the lock race, preserve its one recorded award and
  -- repair only the terminal disposition. No player or financial row is touched.
  IF v_game.status = 'game_over' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.game_results result
      WHERE result.game_id = p_game_id
        AND result.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
        AND result.event_kind = 'chucky_final_award'::public.holm_event_kind
    ) INTO v_terminal_award_exists;

    IF NOT v_terminal_award_exists THEN
      RAISE EXCEPTION 'holm_request_session_end:terminal_award_missing';
    END IF;

    UPDATE public.games
    SET status = 'session_ended',
        session_ended_at = coalesce(session_ended_at, now()),
        pending_session_end = false
    WHERE id = p_game_id;

    RETURN jsonb_build_object(
      'request_recorded', true,
      'terminal_disposition', 'session_ended',
      'late_terminal_repair', true
    );
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

REVOKE ALL ON FUNCTION public.holm_request_session_end(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.holm_request_session_end(uuid) TO authenticated;
