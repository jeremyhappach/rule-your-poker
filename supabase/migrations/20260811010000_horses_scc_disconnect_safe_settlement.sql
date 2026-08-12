-- Disconnect-safe Horses / Ship-Captain-Crew completion.
--
-- Dice state remains in rounds.horses_state, but browser code is no longer the
-- financial or no-client progress owner.  The narrow scheduler below advances
-- only expired Dice turns and only owns a rollover when every human heartbeat
-- is absent.  Normal connected tie presentation/rollover remains client-owned.

CREATE OR REPLACE FUNCTION private.horses_scc_player_result(
  p_dice jsonb,
  p_game_type text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_index integer;
  v_die jsonb;
  v_value integer;
  v_wild_count integer := 0;
  v_best_count integer := 0;
  v_best_value integer := 0;
  v_high_card integer := 0;
  v_candidate_count integer;
  v_ship_count integer := 0;
  v_captain_count integer := 0;
  v_crew_count integer := 0;
  v_cargo_sum integer := 0;
  v_is_scc boolean;
  v_scc_type text;
BEGIN
  IF p_dice IS NULL
     OR jsonb_typeof(p_dice) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_dice) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'horses_scc_player_result:invalid_dice';
  END IF;

  IF p_game_type = 'horses' THEN
    FOR v_index IN 0..4 LOOP
      v_die := p_dice -> v_index;
      BEGIN
        v_value := (v_die ->> 'value')::integer;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'horses_scc_player_result:invalid_die_value';
      END;
      IF v_value NOT BETWEEN 1 AND 6 THEN
        RAISE EXCEPTION 'horses_scc_player_result:die_out_of_range';
      END IF;
      IF v_value = 1 THEN
        v_wild_count := v_wild_count + 1;
      ELSE
        v_high_card := greatest(v_high_card, v_value);
      END IF;
    END LOOP;

    IF v_wild_count = 5 THEN
      RETURN jsonb_build_object(
        'rank', 100,
        'description', '5 1s (Wilds!)',
        'ofAKindCount', 5,
        'highValue', 1
      );
    END IF;

    FOR v_value IN REVERSE 6..2 LOOP
      SELECT count(*) + v_wild_count
        INTO v_candidate_count
        FROM jsonb_array_elements(p_dice) AS dice_entry
       WHERE (dice_entry.value ->> 'value')::integer = v_value;
      IF v_candidate_count > v_best_count
         OR (v_candidate_count = v_best_count AND v_value > v_best_value) THEN
        v_best_count := v_candidate_count;
        v_best_value := v_value;
      END IF;
    END LOOP;

    v_best_count := least(v_best_count, 5);
    IF v_best_count >= 2 THEN
      RETURN jsonb_build_object(
        'rank', v_best_count * 10 + v_best_value,
        'description', v_best_count::text || ' ' || v_best_value::text || 's',
        'ofAKindCount', v_best_count,
        'highValue', v_best_value
      );
    END IF;

    IF v_high_card = 0 THEN
      v_high_card := 1;
    END IF;
    RETURN jsonb_build_object(
      'rank', 10 + v_high_card,
      'description', v_high_card::text || ' high',
      'ofAKindCount', v_best_count,
      'highValue', v_high_card
    );
  END IF;

  IF p_game_type <> 'ship-captain-crew' THEN
    RAISE EXCEPTION 'horses_scc_player_result:unsupported_game_type:%', p_game_type;
  END IF;

  FOR v_index IN 0..4 LOOP
    v_die := p_dice -> v_index;
    BEGIN
      v_value := (v_die ->> 'value')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'horses_scc_player_result:invalid_die_value';
    END;
    IF v_value NOT BETWEEN 1 AND 6 THEN
      RAISE EXCEPTION 'horses_scc_player_result:die_out_of_range';
    END IF;

    v_is_scc := COALESCE((v_die ->> 'isSCC')::boolean, false);
    v_scc_type := NULLIF(v_die ->> 'sccType', '');
    IF v_is_scc THEN
      IF v_scc_type = 'ship' AND v_value = 6 THEN
        v_ship_count := v_ship_count + 1;
      ELSIF v_scc_type = 'captain' AND v_value = 5 THEN
        v_captain_count := v_captain_count + 1;
      ELSIF v_scc_type = 'crew' AND v_value = 4 THEN
        v_crew_count := v_crew_count + 1;
      ELSE
        RAISE EXCEPTION 'horses_scc_player_result:invalid_scc_lock';
      END IF;
    ELSE
      v_cargo_sum := v_cargo_sum + v_value;
    END IF;
  END LOOP;

  IF v_ship_count = 1 AND v_captain_count = 1 AND v_crew_count = 1 THEN
    RETURN jsonb_build_object(
      'rank', v_cargo_sum,
      'description', v_cargo_sum::text,
      'isQualified', true,
      'cargoSum', v_cargo_sum
    );
  END IF;
  IF v_ship_count > 1 OR v_captain_count > 1 OR v_crew_count > 1 THEN
    RAISE EXCEPTION 'horses_scc_player_result:duplicate_scc_lock';
  END IF;
  RETURN jsonb_build_object(
    'rank', 0,
    'description', 'NQ',
    'isQualified', false,
    'cargoSum', 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.horses_scc_terminal_outcome(
  p_state jsonb,
  p_game_type text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  v_player_key text;
  v_player_id uuid;
  v_player_state jsonb;
  v_result jsonb;
  v_entries jsonb := '{}'::jsonb;
  v_winners uuid[] := ARRAY[]::uuid[];
  v_highest_rank integer := NULL;
  v_rank integer;
  v_player_count integer := 0;
BEGIN
  IF p_state IS NULL
     OR jsonb_typeof(p_state) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_state -> 'turnOrder') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_state -> 'playerStates') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'horses_scc_terminal_outcome:invalid_state';
  END IF;

  FOR v_player_key IN
    SELECT jsonb_array_elements_text(p_state -> 'turnOrder')
  LOOP
    BEGIN
      v_player_id := v_player_key::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'horses_scc_terminal_outcome:invalid_player_id';
    END;
    v_player_count := v_player_count + 1;
    v_player_state := p_state -> 'playerStates' -> v_player_key;
    IF v_player_state IS NULL
       OR COALESCE((v_player_state ->> 'isComplete')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'horses_scc_terminal_outcome:incomplete_player:%', v_player_key;
    END IF;

    v_result := private.horses_scc_player_result(v_player_state -> 'dice', p_game_type);
    v_rank := (v_result ->> 'rank')::integer;
    v_entries := v_entries || jsonb_build_object(v_player_key, v_result);
    IF v_highest_rank IS NULL OR v_rank > v_highest_rank THEN
      v_highest_rank := v_rank;
      v_winners := ARRAY[v_player_id];
    ELSIF v_rank = v_highest_rank THEN
      v_winners := array_append(v_winners, v_player_id);
    END IF;
  END LOOP;

  IF v_player_count < 2 OR v_highest_rank IS NULL THEN
    RAISE EXCEPTION 'horses_scc_terminal_outcome:invalid_participants';
  END IF;

  RETURN jsonb_build_object(
    'player_results', v_entries,
    'winner_player_ids', to_jsonb(v_winners),
    'is_tie', cardinality(v_winners) > 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.horses_scc_all_humans_absent(
  p_game_id uuid,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH humans AS (
    SELECT player.user_id, player.created_at
      FROM public.players AS player
     WHERE player.game_id = p_game_id
       AND player.is_bot = false
       AND player.user_id IS NOT NULL
       AND player.status NOT IN ('observer', 'left')
  )
  SELECT CASE
    WHEN count(*) = 0 THEN true
    ELSE bool_and(
      humans.created_at < p_now - interval '15 seconds'
      AND NOT EXISTS (
        SELECT 1
          FROM public.voice_presence_heartbeats AS heartbeat
         WHERE heartbeat.game_id = p_game_id
           AND heartbeat.user_id = humans.user_id
           AND heartbeat.status IN ('active', 'hidden')
           AND heartbeat.updated_at >= p_now - interval '15 seconds'
      )
    )
  END
  FROM humans;
$function$;

CREATE OR REPLACE FUNCTION public.horses_settle_game(
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
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_outcome jsonb;
  v_winner_ids uuid[];
  v_winner_id uuid;
  v_winner_result jsonb;
  v_winner_username text;
  v_pot integer;
  v_result_id uuid;
  v_existing_result_id uuid;
  v_chip_changes jsonb;
  v_description text;
  v_end_session boolean;
  v_disposition text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_game_id IS NULL OR p_round_id IS NULL OR p_dealer_game_id IS NULL OR p_hand_number IS NULL THEN
    RAISE EXCEPTION 'horses_settle_game:missing_identity';
  END IF;

  SELECT * INTO v_round
    FROM public.rounds
   WHERE id = p_round_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_settle_game:round_not_found:%', p_round_id;
  END IF;
  IF v_round.game_id IS DISTINCT FROM p_game_id
     OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number THEN
    RAISE EXCEPTION 'horses_settle_game:round_identity_mismatch';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_settle_game:game_not_found:%', p_game_id;
  END IF;
  IF v_game.game_type NOT IN ('horses', 'ship-captain-crew') THEN
    RAISE EXCEPTION 'horses_settle_game:not_dice_game:%', v_game.game_type;
  END IF;
  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id THEN
    RAISE EXCEPTION 'horses_settle_game:dealer_game_mismatch';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE game_id = p_game_id AND user_id = auth.uid()
     )
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'horses_settle_game:caller_not_in_session';
  END IF;

  SELECT id INTO v_existing_result_id
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND settlement_key = 'horses_terminal'
   LIMIT 1;
  IF v_existing_result_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_settled',
      'result_id', v_existing_result_id,
      'terminal_disposition', CASE WHEN v_game.status = 'session_ended' THEN 'session_ended' ELSE 'game_over' END
    );
  END IF;

  v_state := v_round.horses_state;
  IF v_state IS NULL OR v_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
    RAISE EXCEPTION 'horses_settle_game:round_not_terminal';
  END IF;
  v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
  SELECT array_agg(value::uuid)
    INTO v_winner_ids
    FROM jsonb_array_elements_text(v_outcome -> 'winner_player_ids') AS winner(value);
  IF cardinality(v_winner_ids) <> 1 THEN
    RETURN jsonb_build_object('status', 'tie', 'winner_player_ids', to_jsonb(v_winner_ids));
  END IF;
  v_winner_id := v_winner_ids[1];
  IF NOT EXISTS (
    SELECT 1 FROM public.players
     WHERE id = v_winner_id AND game_id = p_game_id
  ) THEN
    RAISE EXCEPTION 'horses_settle_game:winner_not_participant';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements_text(v_state -> 'turnOrder') AS participant(player_id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = participant.player_id::uuid AND game_id = p_game_id
     )
  ) THEN
    RAISE EXCEPTION 'horses_settle_game:participant_membership_mismatch';
  END IF;

  -- Never infer and replay a partial legacy browser settlement.
  SELECT id INTO v_existing_result_id
    FROM public.game_results
   WHERE dealer_game_id = p_dealer_game_id
     AND hand_number = p_hand_number
     AND game_type = v_game.game_type
     AND settlement_key IS NULL
     AND winner_player_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;
  IF v_existing_result_id IS NOT NULL THEN
    IF v_game.status NOT IN ('game_over', 'session_ended') THEN
      RAISE EXCEPTION 'horses_settle_game:legacy_partial_settlement_requires_review';
    END IF;
    RETURN jsonb_build_object('status', 'already_settled', 'result_id', v_existing_result_id, 'legacy_result', true);
  END IF;
  IF v_round.status = 'completed' OR v_game.status IN ('game_over', 'session_ended') THEN
    RAISE EXCEPTION 'horses_settle_game:legacy_partial_settlement_requires_review';
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'horses_settle_game:game_not_settleable:%', v_game.status;
  END IF;

  SELECT COALESCE(profile.username, 'Player ' || player.position::text)
    INTO v_winner_username
    FROM public.players AS player
    LEFT JOIN public.profiles AS profile ON profile.id = player.user_id
   WHERE player.id = v_winner_id;
  v_winner_result := v_outcome -> 'player_results' -> v_winner_id::text;
  v_pot := greatest(COALESCE(v_game.pot, 0), 0);
  v_chip_changes := jsonb_build_object(v_winner_id::text, v_pot);
  v_description := v_winner_username || ' wins with ' || (v_winner_result ->> 'description');

  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, settlement_key, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    p_game_id, p_dealer_game_id, p_hand_number, 'horses_terminal', v_game.game_type,
    v_winner_id, v_winner_username, v_winner_result ->> 'description',
    v_pot, v_chip_changes, false
  )
  RETURNING id INTO v_result_id;

  PERFORM set_config('ptown.chip_transfer_reason', 'win', true);
  IF v_pot > 0 THEN
    UPDATE public.players
       SET chips = chips + v_pot
     WHERE id = v_winner_id AND game_id = p_game_id;
  END IF;
  UPDATE public.games
     SET pot = 0
   WHERE id = p_game_id AND pot <> 0;

  UPDATE public.rounds
     SET status = 'completed',
         decision_deadline = NULL,
         current_turn_position = NULL
   WHERE id = p_round_id;

  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, player_id, user_id, username,
    chips, is_bot, hand_number
  )
  SELECT player.game_id, p_dealer_game_id, player.id, player.user_id,
         COALESCE(profile.username, CASE WHEN player.is_bot THEN 'Bot' ELSE 'Unknown' END),
         player.chips, player.is_bot, p_hand_number
    FROM public.players AS player
    LEFT JOIN public.profiles AS profile ON profile.id = player.user_id
   WHERE player.game_id = p_game_id
  ON CONFLICT (game_id, dealer_game_id, hand_number, player_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    username = EXCLUDED.username,
    chips = EXCLUDED.chips,
    is_bot = EXCLUDED.is_bot,
    created_at = EXCLUDED.created_at;

  v_end_session := COALESCE(v_game.pending_session_end, false)
    OR private.horses_scc_all_humans_absent(p_game_id, v_now);
  v_disposition := CASE WHEN v_end_session THEN 'session_ended' ELSE 'game_over' END;
  UPDATE public.games
     SET status = v_disposition,
         last_round_result = v_description,
         game_over_at = COALESCE(game_over_at, v_now),
         session_ended_at = CASE WHEN v_end_session THEN COALESCE(session_ended_at, v_now) ELSE session_ended_at END,
         pending_session_end = CASE WHEN v_end_session THEN false ELSE pending_session_end END
   WHERE id = p_game_id;

  RETURN jsonb_build_object(
    'status', 'settled',
    'result_id', v_result_id,
    'winner_player_id', v_winner_id,
    'terminal_disposition', v_disposition
  );
END;
$function$;

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
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:round_not_found';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type NOT IN ('horses', 'ship-captain-crew') THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:not_dice_game';
  END IF;
  IF v_game.status <> 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object('status', 'not_current');
  END IF;
  IF NOT private.horses_scc_all_humans_absent(v_game.id, p_now) THEN
    RETURN jsonb_build_object('status', 'humans_present');
  END IF;

  v_state := v_round.horses_state;
  IF v_state ->> 'gamePhase' IS DISTINCT FROM 'complete' THEN
    RETURN jsonb_build_object('status', 'not_terminal');
  END IF;
  v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
  IF COALESCE((v_outcome ->> 'is_tie')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'not_tie');
  END IF;
  v_turn_order := v_state -> 'turnOrder';
  FOR v_player_key IN SELECT jsonb_array_elements_text(v_turn_order) LOOP
    v_player_ids := array_append(v_player_ids, v_player_key::uuid);
  END LOOP;
  v_player_count := cardinality(v_player_ids);
  IF v_player_count < 2
     OR (SELECT count(*) FROM public.players WHERE game_id = v_game.id AND id = ANY(v_player_ids)) <> v_player_count THEN
    RAISE EXCEPTION 'horses_scc_rollover_abandoned_round:participant_membership_mismatch';
  END IF;

  v_next_hand := v_round.hand_number + 1;
  v_next_round := v_round.round_number + 1;
  IF EXISTS (
    SELECT 1 FROM public.rounds
     WHERE game_id = v_game.id
       AND dealer_game_id = v_round.dealer_game_id
       AND hand_number = v_next_hand
  ) THEN
    RETURN jsonb_build_object('status', 'already_advanced');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results
     WHERE game_id = v_game.id
       AND dealer_game_id = v_round.dealer_game_id
       AND hand_number = v_round.hand_number
       AND is_chopped = true
  ) INTO v_existing_tie;
  IF NOT v_existing_tie THEN
    SELECT string_agg(COALESCE(profile.username, 'Player ' || player.position::text), ' & ' ORDER BY player.position),
           max((entry.value ->> 'description'))
      INTO v_tie_names, v_tie_description
      FROM public.players AS player
      LEFT JOIN public.profiles AS profile ON profile.id = player.user_id
      LEFT JOIN LATERAL jsonb_each(v_outcome -> 'player_results') AS entry(key, value)
        ON entry.key = player.id::text
     WHERE player.id = ANY(v_player_ids);
    INSERT INTO public.game_results (
      game_id, dealer_game_id, hand_number, game_type,
      winner_player_id, winner_username, winning_hand_description,
      pot_won, player_chip_changes, is_chopped
    ) VALUES (
      v_game.id, v_round.dealer_game_id, v_round.hand_number, v_game.game_type,
      NULL, v_tie_names, 'TIE: ' || COALESCE(v_tie_description, 'Unknown') || ' - Rollover',
      0, '{}'::jsonb, true
    );
  END IF;

  v_ante_amount := greatest(COALESCE(v_game.ante_amount, 1), 0);
  v_new_pot := COALESCE(v_game.pot, 0) + v_ante_amount * v_player_count;
  PERFORM set_config('ptown.chip_transfer_reason', 'ante', true);
  IF v_ante_amount > 0 THEN
    UPDATE public.players
       SET chips = chips - v_ante_amount
     WHERE game_id = v_game.id AND id = ANY(v_player_ids);
  END IF;
  UPDATE public.games
     SET pot = v_new_pot
   WHERE id = v_game.id;

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
      jsonb_build_object('dice', v_initial_dice, 'rollsRemaining', 3, 'isComplete', false)
    );
  END LOOP;
  v_first_player_id := (v_turn_order ->> 0)::uuid;
  SELECT player.user_id, player.is_bot, player.auto_fold
    INTO v_controller_user_id, v_first_is_bot, v_first_auto_fold
    FROM public.players AS player
   WHERE player.id = v_first_player_id;
  SELECT player.user_id INTO v_controller_user_id
    FROM public.players AS player
   WHERE player.id = ANY(v_player_ids) AND player.is_bot = false
   ORDER BY array_position(v_player_ids, player.id)
   LIMIT 1;

  v_next_state := jsonb_build_object(
    'currentTurnPlayerId', v_first_player_id,
    'playerStates', v_player_states,
    'gamePhase', 'playing',
    'turnOrder', v_turn_order,
    'botControllerUserId', v_controller_user_id,
    'turnDeadline', CASE WHEN v_first_is_bot OR v_first_auto_fold THEN p_now ELSE p_now + interval '60 seconds' END
  );
  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (
    v_game.id, v_round.dealer_game_id, v_next_hand, v_next_round,
    2, 'betting', v_new_pot, v_next_state
  );
  UPDATE public.rounds SET status = 'completed' WHERE id = v_round.id;
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

  v_chip_changes := (SELECT jsonb_object_agg(player_id::text, -v_ante_amount) FROM unnest(v_player_ids) AS player_id);
  INSERT INTO public.game_results (
    game_id, dealer_game_id, hand_number, game_type,
    winner_player_id, winner_username, winning_hand_description,
    pot_won, player_chip_changes, is_chopped
  ) VALUES (
    v_game.id, v_round.dealer_game_id, v_next_hand, v_game.game_type,
    NULL, v_player_count::text || ' players re-anted $' || v_ante_amount::text, 'Re-Ante (Rollover)',
    0, COALESCE(v_chip_changes, '{}'::jsonb), false
  );

  RETURN jsonb_build_object('status', 'advanced', 'round_number', v_next_round, 'hand_number', v_next_hand);
END;
$function$;

CREATE OR REPLACE FUNCTION private.advance_horses_scc_expired_turn(
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
  v_current_player_id uuid;
  v_current_state jsonb;
  v_current_is_bot boolean;
  v_current_auto_fold boolean;
  v_turn_deadline timestamptz;
  v_all_absent boolean;
  v_current_stale boolean;
  v_should_roll boolean;
  v_dice jsonb;
  v_die jsonb;
  v_index integer;
  v_roll integer;
  v_rolls_remaining integer;
  v_value integer;
  v_target integer;
  v_wild_count integer;
  v_best_count integer;
  v_best_value integer;
  v_candidate_count integer;
  v_has_ship boolean;
  v_has_captain boolean;
  v_has_crew boolean;
  v_cargo_sum integer;
  v_result jsonb;
  v_turn_order jsonb;
  v_seen_current boolean := false;
  v_next_player_id uuid;
  v_next_is_bot boolean;
  v_next_auto_fold boolean;
  v_timer_seconds integer;
  v_next_deadline timestamptz;
  v_outcome jsonb;
  v_winner_count integer;
  v_settlement jsonb;
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing_round');
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id = v_round.game_id FOR UPDATE;
  IF NOT FOUND
     OR v_game.game_type NOT IN ('horses', 'ship-captain-crew')
     OR v_game.status <> 'in_progress'
     OR COALESCE(v_game.is_paused, false)
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.current_round IS DISTINCT FROM v_round.round_number THEN
    RETURN jsonb_build_object('status', 'not_current');
  END IF;

  v_state := v_round.horses_state;
  IF v_state IS NULL THEN
    RETURN jsonb_build_object('status', 'missing_state');
  END IF;
  v_all_absent := private.horses_scc_all_humans_absent(v_game.id, p_now);
  IF v_state ->> 'gamePhase' = 'complete' THEN
    v_outcome := private.horses_scc_terminal_outcome(v_state, v_game.game_type);
    v_winner_count := jsonb_array_length(v_outcome -> 'winner_player_ids');
    IF v_winner_count = 1 THEN
      SELECT public.horses_settle_game(v_game.id, v_round.id, v_round.dealer_game_id, v_round.hand_number)
        INTO v_settlement;
      RETURN v_settlement;
    END IF;
    IF v_all_absent THEN
      RETURN private.horses_scc_rollover_abandoned_round(v_round.id, p_now);
    END IF;
    RETURN jsonb_build_object('status', 'tie_waiting_for_client');
  END IF;
  IF v_state ->> 'gamePhase' IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('status', 'unsupported_phase');
  END IF;

  BEGIN
    v_current_player_id := NULLIF(v_state ->> 'currentTurnPlayerId', '')::uuid;
    v_turn_deadline := NULLIF(v_state ->> 'turnDeadline', '')::timestamptz;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:malformed_turn_identity';
  END;
  IF v_current_player_id IS NULL THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:missing_current_player';
  END IF;
  v_current_state := v_state -> 'playerStates' -> v_current_player_id::text;
  IF v_current_state IS NULL OR COALESCE((v_current_state ->> 'isComplete')::boolean, false) THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_current_player_state';
  END IF;
  SELECT player.is_bot, player.auto_fold
    INTO v_current_is_bot, v_current_auto_fold
    FROM public.players AS player
   WHERE player.id = v_current_player_id AND player.game_id = v_game.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:current_player_not_in_game';
  END IF;
  SELECT NOT EXISTS (
    SELECT 1 FROM public.voice_presence_heartbeats AS heartbeat
     JOIN public.players AS player ON player.user_id = heartbeat.user_id
    WHERE heartbeat.game_id = v_game.id
      AND player.id = v_current_player_id
      AND heartbeat.status IN ('active', 'hidden')
      AND heartbeat.updated_at >= p_now - interval '15 seconds'
  ) INTO v_current_stale;
  v_should_roll := (v_current_is_bot AND v_all_absent)
    OR (v_turn_deadline IS NOT NULL AND v_turn_deadline <= p_now)
    OR (COALESCE(v_current_auto_fold, false) AND v_current_stale);
  IF NOT v_should_roll THEN
    RETURN jsonb_build_object('status', 'not_expired');
  END IF;

  IF NOT v_current_is_bot THEN
    UPDATE public.players
       SET auto_fold = true,
           sit_out_next_hand = true
     WHERE id = v_current_player_id;
  END IF;
  v_dice := v_current_state -> 'dice';
  IF v_dice IS NULL OR jsonb_typeof(v_dice) <> 'array' OR jsonb_array_length(v_dice) <> 5 THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_dice';
  END IF;

  BEGIN
    v_rolls_remaining := (v_current_state ->> 'rollsRemaining')::integer;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_rolls_remaining';
  END;
  IF v_rolls_remaining NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'advance_horses_scc_expired_turn:invalid_rolls_remaining';
  END IF;

  FOR v_roll IN 1..v_rolls_remaining LOOP
    FOR v_index IN 0..4 LOOP
      v_die := v_dice -> v_index;
      IF NOT COALESCE((v_die ->> 'isHeld')::boolean, false) THEN
        v_die := v_die || jsonb_build_object('value', floor(random() * 6)::integer + 1);
        IF v_game.game_type = 'ship-captain-crew' THEN
          v_die := v_die - 'sccType' || jsonb_build_object('isSCC', false);
        END IF;
        v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
      END IF;
    END LOOP;

    IF v_game.game_type = 'horses' THEN
      v_wild_count := 0;
      v_best_count := 0;
      v_best_value := 0;
      FOR v_value IN 1..6 LOOP
        SELECT count(*) INTO v_candidate_count
          FROM jsonb_array_elements(v_dice) AS dice_entry
         WHERE (dice_entry.value ->> 'value')::integer = v_value;
        IF v_value = 1 THEN
          v_wild_count := v_candidate_count;
        END IF;
      END LOOP;
      FOR v_value IN REVERSE 6..2 LOOP
        SELECT count(*) + v_wild_count INTO v_candidate_count
          FROM jsonb_array_elements(v_dice) AS dice_entry
         WHERE (dice_entry.value ->> 'value')::integer = v_value;
        IF v_candidate_count > v_best_count
           OR (v_candidate_count = v_best_count AND v_value > v_best_value) THEN
          v_best_count := v_candidate_count;
          v_best_value := v_value;
        END IF;
      END LOOP;
      v_target := v_best_value;
      FOR v_index IN 0..4 LOOP
        v_die := v_dice -> v_index;
        v_value := (v_die ->> 'value')::integer;
        v_die := jsonb_set(v_die, '{isHeld}', to_jsonb(v_value = 1 OR v_value = v_target), true);
        v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
      END LOOP;
      EXIT WHEN v_best_count >= 5;
    ELSE
      SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'ship'),
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'captain'),
             EXISTS (SELECT 1 FROM jsonb_array_elements(v_dice) AS die WHERE die.value ->> 'sccType' = 'crew')
        INTO v_has_ship, v_has_captain, v_has_crew;
      IF NOT v_has_ship THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 6 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'ship'), false);
            v_has_ship := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND NOT v_has_captain THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 5 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'captain'), false);
            v_has_captain := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND v_has_captain AND NOT v_has_crew THEN
        FOR v_index IN 0..4 LOOP
          v_die := v_dice -> v_index;
          IF (v_die ->> 'value')::integer = 4 AND NOT COALESCE((v_die ->> 'isSCC')::boolean, false) THEN
            v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die || jsonb_build_object('isHeld', true, 'isSCC', true, 'sccType', 'crew'), false);
            v_has_crew := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;
      IF v_has_ship AND v_has_captain AND v_has_crew THEN
        SELECT COALESCE(sum((die.value ->> 'value')::integer), 0) INTO v_cargo_sum
          FROM jsonb_array_elements(v_dice) AS die
         WHERE NOT COALESCE((die.value ->> 'isSCC')::boolean, false);
        EXIT WHEN v_cargo_sum >= 8;
      END IF;
    END IF;
  END LOOP;

  FOR v_index IN 0..4 LOOP
    v_die := jsonb_set(v_dice -> v_index, '{isHeld}', 'true'::jsonb, true);
    v_dice := jsonb_set(v_dice, ARRAY[v_index::text], v_die, false);
  END LOOP;
  v_result := private.horses_scc_player_result(v_dice, v_game.game_type);
  v_current_state := v_current_state || jsonb_build_object(
    'dice', v_dice,
    'rollsRemaining', 0,
    'isComplete', true,
    'result', v_result
  );
  v_state := jsonb_set(v_state, ARRAY['playerStates', v_current_player_id::text], v_current_state, true);

  v_turn_order := v_state -> 'turnOrder';
  FOR v_index IN 0..jsonb_array_length(v_turn_order) - 1 LOOP
    IF (v_turn_order ->> v_index)::uuid = v_current_player_id THEN
      v_seen_current := true;
    ELSIF v_seen_current
      AND NOT COALESCE(((v_state -> 'playerStates' -> (v_turn_order ->> v_index) ->> 'isComplete')::boolean), false) THEN
      v_next_player_id := (v_turn_order ->> v_index)::uuid;
      EXIT;
    END IF;
  END LOOP;

  IF v_next_player_id IS NULL THEN
    v_state := jsonb_set(v_state, '{gamePhase}', '"complete"'::jsonb, true);
    v_state := jsonb_set(v_state, '{currentTurnPlayerId}', 'null'::jsonb, true);
    v_state := jsonb_set(v_state, '{turnDeadline}', 'null'::jsonb, true);
  ELSE
    SELECT player.is_bot, player.auto_fold INTO v_next_is_bot, v_next_auto_fold
      FROM public.players AS player WHERE player.id = v_next_player_id;
    SELECT COALESCE(defaults.decision_timer_seconds, 60) INTO v_timer_seconds
      FROM public.game_defaults AS defaults WHERE defaults.game_type = v_game.game_type;
    v_next_deadline := CASE
      WHEN v_next_is_bot AND v_all_absent THEN p_now
      WHEN v_next_auto_fold THEN p_now
      ELSE p_now + make_interval(secs => COALESCE(v_timer_seconds, 60))
    END;
    v_state := jsonb_set(v_state, '{currentTurnPlayerId}', to_jsonb(v_next_player_id::text), true);
    v_state := jsonb_set(v_state, '{turnDeadline}', to_jsonb(v_next_deadline), true);
  END IF;
  UPDATE public.rounds SET horses_state = v_state WHERE id = v_round.id;

  IF v_next_player_id IS NULL THEN
    SELECT public.horses_settle_game(v_game.id, v_round.id, v_round.dealer_game_id, v_round.hand_number)
      INTO v_settlement;
    RETURN v_settlement;
  END IF;
  RETURN jsonb_build_object('status', 'advanced_turn', 'next_player_id', v_next_player_id);
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_horses_scc_deadlines()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_round record;
  v_processed integer := 0;
BEGIN
  FOR v_round IN
    SELECT round_row.id
      FROM public.rounds AS round_row
      JOIN public.games AS game ON game.id = round_row.game_id
     WHERE game.game_type IN ('horses', 'ship-captain-crew')
       AND game.status = 'in_progress'
       AND COALESCE(game.is_paused, false) = false
       AND game.current_game_uuid = round_row.dealer_game_id
       AND game.current_round = round_row.round_number
       AND round_row.horses_state ->> 'gamePhase' IN ('playing', 'complete')
     ORDER BY game.updated_at, round_row.id
     LIMIT 20
  LOOP
    PERFORM private.advance_horses_scc_expired_turn(v_round.id, clock_timestamp());
    v_processed := v_processed + 1;
  END LOOP;
  RETURN v_processed;
END;
$function$;

REVOKE ALL ON FUNCTION public.horses_settle_game(uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horses_settle_game(uuid, uuid, uuid, integer)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_horses_scc_deadlines() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.horses_settle_game(uuid, uuid, uuid, integer) IS
  'Atomically and replay-safely settles a terminal Horses or Ship-Captain-Crew dealer game.';
COMMENT ON FUNCTION private.enforce_horses_scc_deadlines() IS
  'Advances expired Horses/SCC turns without a browser; all-absent ties roll over server-side.';

DO $schedule$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job WHERE jobname = 'enforce-horses-scc-deadlines-5s' LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
  PERFORM cron.schedule(
    'enforce-horses-scc-deadlines-5s',
    '5 seconds',
    $cron$SELECT private.enforce_horses_scc_deadlines();$cron$
  );
END
$schedule$;
