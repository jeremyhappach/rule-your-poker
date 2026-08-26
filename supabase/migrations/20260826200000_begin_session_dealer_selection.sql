-- Session start is one authoritative transition.  A browser may request it,
-- but it must not separately mutate players, seats, and games: losing any
-- one of those requests previously left a waiting session half-started.
CREATE OR REPLACE FUNCTION public.begin_session_dealer_selection(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_host public.players%ROWTYPE;
  v_other public.players%ROWTYPE;
  v_occupant public.players%ROWTYPE;
  v_eligible_count integer := 0;
  v_target_position integer;
  v_old_other_position integer;
  v_new_dealer_position integer;
  v_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
BEGIN
  IF NOT v_service AND auth.uid() IS NULL THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','missing_game');
  END IF;

  -- A duplicate request is a successful replay, never a second bootstrap.
  IF v_game.status = 'dealer_selection' THEN
    RETURN jsonb_build_object(
      'outcome','already_started',
      'status',v_game.status,
      'timer_generation',v_game.timer_generation,
      'dealer_selection_state',v_game.dealer_selection_state
    );
  END IF;
  IF v_game.status <> 'waiting' THEN
    RETURN jsonb_build_object('outcome','not_startable','status',v_game.status);
  END IF;

  -- Lock every physical seat before deciding eligibility or swapping seats.
  PERFORM 1
    FROM public.players player
   WHERE player.game_id = p_game_id
   FOR UPDATE;

  -- Only seated players who explicitly opted into the next dealer game are
  -- dealt in.  Sitting-out players retain their seats and remain out.
  SELECT count(*) INTO v_eligible_count
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false));

  IF v_eligible_count < 2 THEN
    RETURN jsonb_build_object('outcome','not_ready','eligible_players',v_eligible_count);
  END IF;

  -- Match the canonical session-host rule used by the waiting CTA: explicit
  -- current_host first, otherwise the earliest human participant.
  SELECT player.* INTO v_host
    FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     AND NOT coalesce(player.is_bot,false)
   ORDER BY CASE WHEN player.user_id = v_game.current_host THEN 0 ELSE 1 END,
            player.created_at NULLS LAST,
            player.id
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT player.* INTO v_host
      FROM public.players player
     WHERE player.game_id = p_game_id
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     ORDER BY player.created_at NULLS LAST, player.id
     LIMIT 1;
  END IF;

  IF NOT v_service AND v_host.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('outcome','not_authorized');
  END IF;

  -- Normalize exactly two opted-in seats inside this same locked transition.
  -- A NULL park avoids the (game_id, position) uniqueness collision.
  IF v_eligible_count = 2 THEN
    SELECT player.* INTO v_other
      FROM public.players player
     WHERE player.game_id = p_game_id
       AND player.id <> v_host.id
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer','left')
       AND (coalesce(player.waiting,false) OR NOT coalesce(player.sitting_out,false))
     LIMIT 1;

    v_target_position := ((v_host.position - 1 + 3) % 7) + 1;
    v_old_other_position := v_other.position;
    IF least(abs(v_host.position - v_other.position),
             7 - abs(v_host.position - v_other.position)) <> 3 THEN
      SELECT player.* INTO v_occupant
        FROM public.players player
       WHERE player.game_id = p_game_id
         AND player.id <> v_other.id
         AND player.position = v_target_position
       LIMIT 1;

      IF FOUND THEN
        UPDATE public.players SET position = NULL WHERE id = v_occupant.id;
      END IF;
      UPDATE public.players SET position = v_target_position WHERE id = v_other.id;
      IF v_occupant.id IS NOT NULL THEN
        UPDATE public.players SET position = v_old_other_position WHERE id = v_occupant.id;
      END IF;

      v_new_dealer_position := v_game.dealer_position;
      IF v_new_dealer_position = v_old_other_position THEN
        v_new_dealer_position := v_target_position;
      ELSIF v_occupant.id IS NOT NULL
            AND v_new_dealer_position = v_target_position THEN
        v_new_dealer_position := v_old_other_position;
      END IF;
      IF v_new_dealer_position IS DISTINCT FROM v_game.dealer_position THEN
        UPDATE public.games
           SET dealer_position = v_new_dealer_position
         WHERE id = p_game_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.players
     SET status = 'active',
         sitting_out = false,
         waiting = false
   WHERE game_id = p_game_id
     AND position IS NOT NULL
     AND status NOT IN ('observer','left')
     AND (coalesce(waiting,false) OR NOT coalesce(sitting_out,false));

  UPDATE public.games
     SET status = 'dealer_selection',
         dealer_selection_state = NULL,
         current_game_uuid = NULL,
         config_deadline = NULL,
         config_complete = false,
         awaiting_next_round = false,
         last_round_result = NULL
   WHERE id = p_game_id
   RETURNING * INTO v_game;

  RETURN jsonb_build_object(
    'outcome','started',
    'status',v_game.status,
    'timer_generation',v_game.timer_generation
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_session_dealer_selection(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_session_dealer_selection(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.begin_session_dealer_selection(uuid) IS
  'Atomically starts an opted-in waiting session and schedules canonical dealer selection; replay-safe for duplicate client requests.';
