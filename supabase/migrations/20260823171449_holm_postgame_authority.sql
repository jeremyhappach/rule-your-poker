-- Routes connected Holm terminal presentation and disconnected recovery through
-- the same exact, replay-safe PostgreSQL postgame owner. The existing standard
-- postgame claim/timer remains shared with Horses/SCC; only Holm gains the
-- completed-round and exact terminal-settlement admission required here.

CREATE OR REPLACE FUNCTION private.advance_standard_postgame(
  p_game_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game_type text;
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_claim private.standard_postgame_advances%ROWTYPE;
  v_winner_id uuid;
  v_terminal_settlements integer := 0;
  v_active integer;
  v_humans integer;
  v_allow_bots boolean := false;
  v_make_take boolean := false;
  v_positions integer[];
  v_index integer;
  v_next_position integer;
  v_target text;
  v_deadline timestamptz;
  v_result jsonb;
BEGIN
  IF p_game_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number < 1 THEN
    RAISE EXCEPTION 'advance_standard_postgame:missing_identity';
  END IF;

  SELECT * INTO v_claim
    FROM private.standard_postgame_advances claim
   WHERE claim.game_id = p_game_id
     AND claim.dealer_game_id = p_dealer_game_id
     AND claim.hand_number = p_hand_number;
  IF FOUND THEN
    RETURN v_claim.result || jsonb_build_object(
      'outcome', 'already_advanced',
      'deduped', true
    );
  END IF;

  -- Holm settlement locks the exact round before the owning game. Preserve
  -- that order so postgame can never deadlock the financial transaction.
  SELECT game_row.game_type INTO v_game_type
    FROM public.games game_row
   WHERE game_row.id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing_game');
  END IF;

  IF v_game_type IN ('holm', 'holm-game') THEN
    BEGIN
      SELECT * INTO STRICT v_round
        FROM public.rounds round_row
       WHERE round_row.game_id = p_game_id
         AND round_row.dealer_game_id = p_dealer_game_id
         AND round_row.hand_number = p_hand_number
       FOR UPDATE;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE EXCEPTION
          'advance_standard_postgame:holm_round_not_found:%/%',
          p_dealer_game_id,
          p_hand_number;
      WHEN TOO_MANY_ROWS THEN
        RAISE EXCEPTION
          'advance_standard_postgame:holm_round_identity_violation:%/%',
          p_dealer_game_id,
          p_hand_number;
    END;
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing_game');
  END IF;

  IF v_game.game_type NOT IN (
       'holm', 'holm-game', 'horses', 'ship-captain-crew'
     )
     OR v_game.status IS DISTINCT FROM 'game_over'
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM p_hand_number THEN
    RETURN jsonb_build_object(
      'outcome', 'stale_identity',
      'status', v_game.status,
      'current_dealer_game_id', v_game.current_game_uuid,
      'current_hand_number', v_game.total_hands
    );
  END IF;

  IF v_game.game_type IN ('holm', 'holm-game') THEN
    IF v_round.status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION
        'advance_standard_postgame:holm_round_not_terminal:%',
        v_round.status;
    END IF;

    SELECT
      count(*),
      (array_agg(result.winner_player_id ORDER BY result.created_at, result.id))[1]
      INTO v_terminal_settlements, v_winner_id
      FROM public.game_results result
     WHERE result.game_id = p_game_id
       AND result.dealer_game_id = p_dealer_game_id
       AND result.hand_number = p_hand_number
       AND result.game_type IN ('holm', 'holm-game')
       AND result.event_kind = 'chucky_final_award';

    IF v_terminal_settlements IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION
        'advance_standard_postgame:holm_settlement_not_committed:%',
        v_terminal_settlements;
    END IF;
  ELSE
    -- Preserve the installed Horses/SCC behavior. Their dedicated authority
    -- migration and proof remain a separate bounded phase.
    SELECT result.winner_player_id INTO v_winner_id
      FROM public.game_results result
     WHERE result.game_id = p_game_id
       AND result.dealer_game_id = p_dealer_game_id
       AND result.hand_number = p_hand_number
     ORDER BY result.created_at DESC, result.id DESC
     LIMIT 1;
  END IF;

  -- Lock the full participation cohort before consuming queued intent.
  PERFORM 1
    FROM public.players player
   WHERE player.game_id = p_game_id
   ORDER BY player.id
   FOR UPDATE;

  DELETE FROM public.players player
   WHERE player.game_id = p_game_id
     AND coalesce(player.is_bot, false)
     AND coalesce(player.stand_up_next_hand, false);

  UPDATE public.players player
     SET status = CASE
           WHEN coalesce(player.stand_up_next_hand, false)
             THEN 'left'
           ELSE player.status
         END,
         sitting_out = CASE
           WHEN coalesce(player.stand_up_next_hand, false)
             OR coalesce(player.sit_out_next_hand, false)
             OR (
               v_game.game_type IN ('holm', 'holm-game')
               AND coalesce(player.auto_fold, false)
             ) THEN true
           WHEN coalesce(player.waiting, false) THEN false
           ELSE player.sitting_out
         END,
         waiting = false,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         auto_fold = false,
         current_decision = NULL,
         decision_locked = false,
         pre_fold = false,
         pre_stay = false,
         ante_decision = NULL,
         legs = 0
   WHERE player.game_id = p_game_id;

  SELECT
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out, false)
        AND player.status NOT IN ('observer', 'left')
        AND player.position IS NOT NULL
    ),
    count(*) FILTER (
      WHERE NOT coalesce(player.sitting_out, false)
        AND player.status NOT IN ('observer', 'left')
        AND player.position IS NOT NULL
        AND NOT coalesce(player.is_bot, false)
    )
    INTO v_active, v_humans
    FROM public.players player
   WHERE player.game_id = p_game_id;

  IF coalesce(v_game.pending_session_end, false) OR v_humans = 0 THEN
    v_target := 'session_ended';
  ELSIF v_active < 2 THEN
    v_target := 'waiting';
  ELSE
    SELECT coalesce(defaults.allow_bot_dealers, false)
      INTO v_allow_bots
      FROM public.game_defaults defaults
     WHERE defaults.game_type = v_game.game_type
     LIMIT 1;
    SELECT coalesce((setting.value->>'enabled')::boolean, false)
      INTO v_make_take
      FROM public.system_settings setting
     WHERE setting.key = 'make_it_take_it'
     LIMIT 1;
    v_allow_bots := coalesce(v_allow_bots, false);
    v_make_take := coalesce(v_make_take, false);

    IF v_make_take AND v_winner_id IS NOT NULL THEN
      SELECT player.position INTO v_next_position
        FROM public.players player
       WHERE player.id = v_winner_id
         AND player.game_id = p_game_id
         AND NOT coalesce(player.is_bot, false)
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')
         AND player.position IS NOT NULL;
    END IF;

    IF v_next_position IS NULL THEN
      SELECT array_agg(player.position ORDER BY player.position)
        INTO v_positions
        FROM public.players player
       WHERE player.game_id = p_game_id
         AND NOT coalesce(player.sitting_out, false)
         AND player.status NOT IN ('observer', 'left')
         AND player.position IS NOT NULL
         AND (v_allow_bots OR NOT coalesce(player.is_bot, false));
      IF coalesce(cardinality(v_positions), 0) = 0 THEN
        v_target := 'dealer_selection';
      ELSE
        v_index := array_position(
          v_positions,
          coalesce(v_game.dealer_position, 1)
        );
        v_next_position := CASE
          WHEN v_index IS NULL THEN v_positions[1]
          ELSE v_positions[(v_index % cardinality(v_positions)) + 1]
        END;
      END IF;
    END IF;

    IF v_target IS NULL THEN
      v_target := 'game_selection';
      v_deadline := clock_timestamp() + make_interval(
        secs => greatest(1, coalesce(v_game.game_setup_timer_seconds, 30))
      );
    END IF;
  END IF;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE game_id = p_game_id
     AND dealer_game_id = p_dealer_game_id
     AND status <> 'completed';

  UPDATE public.games
     SET status = v_target,
         config_complete = false,
         config_deadline = v_deadline,
         ante_decision_deadline = NULL,
         last_round_result = NULL,
         current_round = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         pot = 0,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         game_over_at = NULL,
         buck_position = NULL,
         total_hands = 0,
         is_first_hand = false,
         current_game_uuid = NULL,
         dealer_selection_state = NULL,
         dealer_position = CASE
           WHEN v_target = 'game_selection' THEN v_next_position
           ELSE dealer_position
         END,
         pending_session_end = CASE
           WHEN v_target = 'session_ended' THEN false
           ELSE pending_session_end
         END,
         session_ended_at = CASE
           WHEN v_target = 'session_ended'
             THEN coalesce(session_ended_at, clock_timestamp())
           ELSE session_ended_at
         END
   WHERE id = p_game_id;

  v_result := jsonb_build_object(
    'outcome', 'advanced',
    'deduped', false,
    'winner_player_id', v_winner_id,
    'status', v_target,
    'dealer_position', CASE
      WHEN v_target = 'game_selection' THEN v_next_position
      ELSE NULL
    END,
    'config_deadline', v_deadline
  );

  INSERT INTO private.standard_postgame_advances (
    game_id,
    dealer_game_id,
    hand_number,
    winner_player_id,
    target_status,
    dealer_position,
    config_deadline,
    result
  ) VALUES (
    p_game_id,
    p_dealer_game_id,
    p_hand_number,
    v_winner_id,
    v_target,
    CASE WHEN v_target = 'game_selection' THEN v_next_position END,
    v_deadline,
    v_result
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION private.advance_standard_postgame(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.holm_advance_postgame(
  p_game_id uuid,
  p_round_id uuid,
  p_dealer_game_id uuid,
  p_hand_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_round public.rounds%ROWTYPE;
BEGIN
  IF p_game_id IS NULL
     OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL
     OR p_hand_number IS NULL
     OR p_hand_number < 1 THEN
    RAISE EXCEPTION 'holm_advance_postgame:missing_identity';
  END IF;

  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'holm_advance_postgame:authentication_required';
  END IF;

  IF NOT v_is_service
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1
         FROM public.players participant
        WHERE participant.game_id = p_game_id
          AND participant.user_id = v_actor_id
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.session_player_snapshots snapshot
        WHERE snapshot.game_id = p_game_id
          AND snapshot.user_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'holm_advance_postgame:not_in_session';
  END IF;

  -- The caller supplies the presentation identity. Lock it before the private
  -- owner takes the game lock, matching Holm settlement's lock order.
  SELECT * INTO v_round
    FROM public.rounds round_row
   WHERE round_row.id = p_round_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'holm_advance_postgame:round_identity_mismatch';
  END IF;

  RETURN private.advance_standard_postgame(
    p_game_id,
    p_dealer_game_id,
    p_hand_number
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.holm_advance_postgame(
  uuid, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.holm_advance_postgame(
  uuid, uuid, uuid, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.holm_advance_postgame(
  uuid, uuid, uuid, integer
) IS
  'Submits exact settled Holm presentation identity to the shared replay-safe PostgreSQL postgame owner used by canonical timer recovery.';
