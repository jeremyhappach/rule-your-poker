-- An explicit Stand Up is authoritative participation evidence. At a settled
-- post-game boundary, commit the player exit and the resulting lifecycle
-- disposition together instead of waiting for the heartbeat reconciler.

CREATE OR REPLACE FUNCTION public.stand_up_and_resolve_postgame(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_has_settled_result boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  -- Check membership before taking the session lock so an unrelated caller
  -- cannot use this SECURITY DEFINER function to inspect session existence.
  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND player.is_bot = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
  END IF;

  -- Re-lock the authenticated participant after the game lock. The unique
  -- (game_id, user_id) key makes this the caller's one authoritative row.
  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND player.is_bot = false
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  SELECT
    count(*) FILTER (WHERE player.is_bot = false),
    count(*)
    INTO v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.game_results AS result
     WHERE result.game_id = p_game_id
  ) INTO v_has_settled_result;

  -- Never-started rooms and live dealer games retain their existing owners.
  -- This RPC only closes the missing boundary after a settled dealer game.
  IF NOT v_has_settled_result
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  v_lifecycle_resolved := true;

  IF v_active_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );

      -- Financial safety may block terminal settlement if a final snapshot is
      -- missing. Even then, leave setup immediately so no client can reopen a
      -- dealer dialog for a session with no active human participants.
      IF v_outcome <> 'session-ended-with-results'
         AND v_outcome <> 'already-session-ended' THEN
        UPDATE public.games
           SET status = 'waiting',
               current_game_uuid = NULL,
               config_complete = false,
               config_deadline = NULL,
               ante_decision_deadline = NULL,
               awaiting_next_round = false,
               last_round_result = NULL
         WHERE id = p_game_id
           AND status <> 'session_ended';
      END IF;
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.stand_up_and_resolve_postgame(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stand_up_and_resolve_postgame(uuid)
  TO authenticated;
