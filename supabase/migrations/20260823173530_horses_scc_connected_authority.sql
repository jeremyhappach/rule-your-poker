-- Routes connected Horses / Ship-Captain-Crew completed-round progression
-- through the same PostgreSQL owners used by no-client recovery. A browser
-- submits only exact immutable identity; PostgreSQL decides tie rollover
-- versus terminal settlement and later owns the postgame handoff.

CREATE OR REPLACE FUNCTION private.horses_scc_rollover_abandoned_round(
  p_round_id uuid,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_outcome jsonb;
  v_turn_order jsonb;
  v_player_key text;
  v_player_ids uuid[] := ARRAY[]::uuid[];
  v_player_count integer;
  v_next_hand integer;
  v_next_round integer;
  v_ante_amount integer;
  v_new_pot integer;
  v_initial_dice jsonb;
  v_player_states jsonb := '{}'::jsonb;
  v_next_state jsonb;
  v_first_player_id uuid;
  v_controller_user_id uuid;
  v_first_is_bot boolean;
  v_first_auto_fold boolean;
  v_tie_names text;
  v_tie_description text;
  v_chip_changes jsonb;
  v_existing_tie boolean;
  v_pre_chips jsonb;
  v_post_chips jsonb;
BEGIN
  SELECT * INTO v_round
    FROM public.rounds round_row
   WHERE round_row.id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:round_not_found';
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = v_round.game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('horses', 'ship-captain-crew') THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:not_dice_game';
  END IF;
  IF v_game.status <> 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object('status', 'not_current');
  END IF;

  -- The function remains private. The deadline runner calls it only after
  -- proving every human absent; the authenticated connected-client wrapper
  -- below proves exact membership and identity before calling the same owner.
  v_state := v_round.horses_state;
  IF v_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
    RETURN jsonb_build_object('status', 'not_terminal');
  END IF;
  v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
  IF coalesce((v_outcome ->> 'is_tie')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'not_tie');
  END IF;

  v_turn_order := v_state -> 'turnOrder';
  FOR v_player_key IN SELECT jsonb_array_elements_text(v_turn_order) LOOP
    v_player_ids := array_append(v_player_ids, v_player_key::uuid);
  END LOOP;
  v_player_count := cardinality(v_player_ids);
  IF v_player_count < 2
     OR (
       SELECT count(*)
         FROM public.players player
        WHERE player.game_id = v_game.id
          AND player.id = ANY(v_player_ids)
     ) <> v_player_count THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:participant_membership_mismatch';
  END IF;

  v_next_hand := v_round.hand_number + 1;
  v_next_round := v_round.round_number + 1;
  IF EXISTS (
    SELECT 1
      FROM public.rounds successor
     WHERE successor.game_id = v_game.id
       AND successor.dealer_game_id = v_round.dealer_game_id
       AND successor.hand_number = v_next_hand
  ) THEN
    RETURN jsonb_build_object('status', 'already_advanced');
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.game_results result
     WHERE result.game_id = v_game.id
       AND result.dealer_game_id = v_round.dealer_game_id
       AND result.hand_number = v_round.hand_number
       AND result.is_chopped = true
  ) INTO v_existing_tie;
  IF NOT v_existing_tie THEN
    SELECT
      string_agg(
        coalesce(profile.username, 'Player ' || player.position::text),
        ' & ' ORDER BY player.position
      ),
      max(entry.value ->> 'description')
      INTO v_tie_names, v_tie_description
      FROM public.players player
      LEFT JOIN public.profiles profile ON profile.id = player.user_id
      LEFT JOIN LATERAL jsonb_each(v_outcome -> 'player_results') entry(key, value)
        ON entry.key = player.id::text
     WHERE player.id = ANY(v_player_ids);

    INSERT INTO public.game_results (
      game_id, dealer_game_id, hand_number, game_type,
      winner_player_id, winner_username, winning_hand_description,
      pot_won, player_chip_changes, is_chopped
    ) VALUES (
      v_game.id,
      v_round.dealer_game_id,
      v_round.hand_number,
      v_game.game_type,
      NULL,
      v_tie_names,
      'TIE: ' || coalesce(v_tie_description, 'Unknown') || ' - Rollover',
      0,
      '{}'::jsonb,
      true
    );
  END IF;

  v_ante_amount := greatest(coalesce(v_game.ante_amount, 1), 0);
  v_new_pot := coalesce(v_game.pot, 0) + v_ante_amount * v_player_count;

  SELECT jsonb_object_agg(player.id::text, player.chips)
    INTO v_pre_chips
    FROM public.players player
   WHERE player.game_id = v_game.id
     AND player.id = ANY(v_player_ids);

  PERFORM set_config('ptown.chip_transfer_reason', 'ante', true);
  IF v_ante_amount > 0 THEN
    UPDATE public.players player
       SET chips = player.chips - v_ante_amount
     WHERE player.game_id = v_game.id
       AND player.id = ANY(v_player_ids);
  END IF;
  UPDATE public.games
     SET pot = v_new_pot
   WHERE id = v_game.id;

  SELECT jsonb_object_agg(player.id::text, player.chips)
    INTO v_post_chips
    FROM public.players player
   WHERE player.game_id = v_game.id
     AND player.id = ANY(v_player_ids);

  v_initial_dice := CASE WHEN v_game.game_type = 'ship-captain-crew' THEN
    jsonb_build_array(
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false),
      jsonb_build_object('value', 0, 'isHeld', false, 'isSCC', false)
    ) ELSE jsonb_build_array(
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false),
      jsonb_build_object('value', 0, 'isHeld', false)
    ) END;

  FOR v_player_key IN SELECT jsonb_array_elements_text(v_turn_order) LOOP
    v_player_states := v_player_states || jsonb_build_object(
      v_player_key,
      jsonb_build_object(
        'dice', v_initial_dice,
        'rollsRemaining', 3,
        'isComplete', false
      )
    );
  END LOOP;

  v_first_player_id := (v_turn_order ->> 0)::uuid;
  SELECT player.user_id, player.is_bot, player.auto_fold
    INTO v_controller_user_id, v_first_is_bot, v_first_auto_fold
    FROM public.players player
   WHERE player.id = v_first_player_id;
  SELECT player.user_id INTO v_controller_user_id
    FROM public.players player
   WHERE player.id = ANY(v_player_ids)
     AND player.is_bot = false
   ORDER BY array_position(v_player_ids, player.id)
   LIMIT 1;

  v_next_state := jsonb_build_object(
    'currentTurnPlayerId', v_first_player_id,
    'playerStates', v_player_states,
    'gamePhase', 'playing',
    'turnOrder', v_turn_order,
    'botControllerUserId', v_controller_user_id,
    'turnDeadline', CASE
      WHEN v_first_is_bot OR v_first_auto_fold THEN p_now
      ELSE p_now + interval '60 seconds'
    END
  );

  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (
    v_game.id,
    v_round.dealer_game_id,
    v_next_hand,
    v_next_round,
    2,
    'betting',
    v_new_pot,
    v_next_state
  );

  UPDATE public.rounds
     SET status = 'completed'
   WHERE id = v_round.id;

  UPDATE public.games
     SET current_round = v_next_round,
         total_hands = v_next_hand,
         status = 'in_progress',
         awaiting_next_round = false,
         all_decisions_in = false,
         last_round_result = NULL,
         game_over_at = NULL,
         is_first_hand = false
   WHERE id = v_game.id;

  v_chip_changes := (
    SELECT jsonb_object_agg(player_id::text, -v_ante_amount)
      FROM unnest(v_player_ids) player_id
  );
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    v_game.id,
    v_round.dealer_game_id,
    v_next_hand,
    v_game.game_type,
    NULL,
    v_player_count::text || ' players re-anted $' || v_ante_amount::text,
    'Re-Ante (Rollover)',
    0,
    coalesce(v_chip_changes, '{}'::jsonb),
    false
  );

  RETURN jsonb_build_object(
    'status', 'advanced',
    'transition', 'tie_rollover',
    'round_number', v_next_round,
    'hand_number', v_next_hand,
    'ante_amount', v_ante_amount,
    'active_count', v_player_count,
    'pot', v_new_pot,
    'pre_chips', coalesce(v_pre_chips, '{}'::jsonb),
    'post_chips', coalesce(v_post_chips, '{}'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.horses_scc_rollover_abandoned_round(
  uuid, timestamptz
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.horses_scc_advance_completed_round(
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
  v_game public.games%ROWTYPE;
  v_outcome jsonb;
  v_winner_count integer;
  v_existing_result_id uuid;
  v_successor public.rounds%ROWTYPE;
  v_player_ids uuid[];
  v_ante_amount integer;
  v_post_chips jsonb;
  v_result jsonb;
BEGIN
  IF p_game_id IS NULL
     OR p_round_id IS NULL
     OR p_dealer_game_id IS NULL
     OR p_hand_number IS NULL
     OR p_hand_number < 1 THEN
    RAISE EXCEPTION 'horses_scc_advance_completed_round:missing_identity';
  END IF;
  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'horses_scc_advance_completed_round:authentication_required';
  END IF;
  IF NOT v_is_service
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.players participant
        WHERE participant.game_id = p_game_id
          AND participant.user_id = v_actor_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.session_player_snapshots snapshot
        WHERE snapshot.game_id = p_game_id
          AND snapshot.user_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'horses_scc_advance_completed_round:not_in_session';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds round_row
   WHERE round_row.id = p_round_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'horses_scc_advance_completed_round:round_identity_mismatch';
  END IF;
  IF v_round.horses_state IS NULL
     OR v_round.horses_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'horses_scc_advance_completed_round:round_not_terminal';
  END IF;

  SELECT * INTO v_game
    FROM public.games game_row
   WHERE game_row.id = p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('horses', 'ship-captain-crew') THEN
    RAISE EXCEPTION 'horses_scc_advance_completed_round:not_dice_game';
  END IF;

  v_outcome := private.horses_scc_terminal_outcome(
    v_round.horses_state,
    v_game.game_type
  );
  v_winner_count := jsonb_array_length(v_outcome -> 'winner_player_ids');
  IF v_winner_count = 1 THEN
    SELECT result.id INTO v_existing_result_id
      FROM public.game_results result
     WHERE result.game_id = p_game_id
       AND result.dealer_game_id = p_dealer_game_id
       AND result.hand_number = p_hand_number
       AND result.game_type = v_game.game_type
       AND result.settlement_key = 'horses_terminal'
     LIMIT 1;
    IF v_existing_result_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'already_settled',
        'transition', 'terminal_settlement',
        'result_id', v_existing_result_id,
        'terminal_disposition', CASE
          WHEN v_game.status = 'session_ended' THEN 'session_ended'
          ELSE 'game_over'
        END
      );
    END IF;
  ELSIF v_winner_count > 1 THEN
    SELECT * INTO v_successor
      FROM public.rounds successor
     WHERE successor.game_id = p_game_id
       AND successor.dealer_game_id = p_dealer_game_id
       AND successor.hand_number = p_hand_number + 1
     ORDER BY successor.round_number
     LIMIT 1;
    IF FOUND
       AND v_game.status = 'in_progress'
       AND v_game.current_game_uuid = p_dealer_game_id
       AND v_game.total_hands = p_hand_number + 1 THEN
      SELECT array_agg(value::uuid)
        INTO v_player_ids
        FROM jsonb_array_elements_text(v_round.horses_state -> 'turnOrder') player(value);
      v_ante_amount := greatest(coalesce(v_game.ante_amount, 1), 0);
      SELECT jsonb_object_agg(player.id::text, player.chips)
        INTO v_post_chips
        FROM public.players player
       WHERE player.game_id = p_game_id
         AND player.id = ANY(v_player_ids);
      RETURN jsonb_build_object(
        'status', 'already_advanced',
        'transition', 'tie_rollover',
        'round_number', v_successor.round_number,
        'hand_number', v_successor.hand_number,
        'ante_amount', v_ante_amount,
        'active_count', cardinality(v_player_ids),
        'pot', v_game.pot,
        'pre_chips', (
          SELECT coalesce(jsonb_object_agg(entry.key, (entry.value::integer + v_ante_amount)), '{}'::jsonb)
            FROM jsonb_each_text(coalesce(v_post_chips, '{}'::jsonb)) entry
        ),
        'post_chips', coalesce(v_post_chips, '{}'::jsonb)
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'horses_scc_advance_completed_round:no_outcome';
  END IF;

  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object(
      'status', 'stale_identity',
      'transition', CASE
        WHEN v_winner_count = 1 THEN 'terminal_settlement'
        ELSE 'tie_rollover'
      END
    );
  END IF;

  IF v_winner_count = 1 THEN
    v_result := public.horses_settle_game(
      p_game_id,
      p_round_id,
      p_dealer_game_id,
      p_hand_number
    );
    RETURN v_result || jsonb_build_object('transition', 'terminal_settlement');
  END IF;

  RETURN private.horses_scc_rollover_abandoned_round(
    p_round_id,
    clock_timestamp()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.horses_scc_advance_completed_round(
  uuid, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horses_scc_advance_completed_round(
  uuid, uuid, uuid, integer
) TO authenticated, service_role;

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

  SELECT game_row.game_type INTO v_game_type
    FROM public.games game_row
   WHERE game_row.id = p_game_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing_game');
  END IF;

  IF v_game_type IN (
    'holm', 'holm-game', 'horses', 'ship-captain-crew'
  ) THEN
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
          'advance_standard_postgame:round_not_found:%/%',
          p_dealer_game_id,
          p_hand_number;
      WHEN TOO_MANY_ROWS THEN
        RAISE EXCEPTION
          'advance_standard_postgame:round_identity_violation:%/%',
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
    IF v_round.status IS DISTINCT FROM 'completed'
       OR v_round.horses_state IS NULL
       OR v_round.horses_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
      RAISE EXCEPTION
        'advance_standard_postgame:dice_round_not_terminal:%',
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
       AND result.game_type = v_game.game_type
       AND result.settlement_key = 'horses_terminal';
    IF v_terminal_settlements IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION
        'advance_standard_postgame:dice_settlement_not_committed:%',
        v_terminal_settlements;
    END IF;
  END IF;

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
           WHEN coalesce(player.stand_up_next_hand, false) THEN 'left'
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
    game_id, dealer_game_id, hand_number, winner_player_id,
    target_status, dealer_position, config_deadline, result
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

REVOKE ALL ON FUNCTION private.advance_standard_postgame(
  uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.horses_scc_advance_postgame(
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
    RAISE EXCEPTION 'horses_scc_advance_postgame:missing_identity';
  END IF;
  IF v_actor_id IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'horses_scc_advance_postgame:authentication_required';
  END IF;
  IF NOT v_is_service
     AND NOT public.has_role(v_actor_id, 'admin'::public.app_role)
     AND NOT EXISTS (
       SELECT 1 FROM public.players participant
        WHERE participant.game_id = p_game_id
          AND participant.user_id = v_actor_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.session_player_snapshots snapshot
        WHERE snapshot.game_id = p_game_id
          AND snapshot.user_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'horses_scc_advance_postgame:not_in_session';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds round_row
   WHERE round_row.id = p_round_id
   FOR UPDATE;
  IF NOT FOUND
     OR v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'horses_scc_advance_postgame:round_identity_mismatch';
  END IF;

  RETURN private.advance_standard_postgame(
    p_game_id,
    p_dealer_game_id,
    p_hand_number
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.horses_scc_advance_postgame(
  uuid, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horses_scc_advance_postgame(
  uuid, uuid, uuid, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.horses_scc_advance_completed_round(
  uuid, uuid, uuid, integer
) IS
  'Submits exact completed Horses/SCC identity; PostgreSQL atomically selects tie rollover or terminal settlement.';
COMMENT ON FUNCTION public.horses_scc_advance_postgame(
  uuid, uuid, uuid, integer
) IS
  'Submits exact settled Horses/SCC presentation identity to the replay-safe PostgreSQL postgame owner used by canonical timer recovery.';
