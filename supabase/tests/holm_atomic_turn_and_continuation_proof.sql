-- Rollback-only proof for atomic Holm decision/turn/deadline ownership and
-- replay-safe successor-hand publication. No synthetic row survives.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_unauthorized_id uuid := gen_random_uuid();
  v_player_one_id uuid;
  v_player_two_id uuid;
  v_round_one_id uuid;
  v_round_two_id uuid;
  v_terminal_round_id uuid := gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_deadline_before timestamptz;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at
      FROM public.profiles
      ORDER BY created_at, id
      LIMIT 2
    ) profiles;

  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.holm_submit_decision(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.holm_submit_decision(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:decision_grants_invalid';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.proceed_to_next_holm_hand(uuid,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.proceed_to_next_holm_hand(uuid,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:continuation_grants_invalid';
  END IF;

  UPDATE public.game_defaults
     SET debug_harness = 'force_chucky_beats_player'
   WHERE game_type = 'holm';
  UPDATE public.system_settings
     SET value = jsonb_build_object('enabled', true)
   WHERE key = 'harnesses_mode';

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm atomic authority',
    'ante_decision', 'holm-game', v_dealer_game_id, v_users[1],
    2, true, 1, 0, false
  );

  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_dealer_game_id, v_game_id, v_users[1], 'holm'
  );

  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);

  SELECT id INTO v_player_one_id
  FROM public.players
  WHERE game_id = v_game_id AND position = 1;
  SELECT id INTO v_player_two_id
  FROM public.players
  WHERE game_id = v_game_id AND position = 2;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  SELECT public.start_holm_initial_hand(v_game_id, false) INTO v_result;
  v_round_one_id := (v_result->>'round_id')::uuid;

  IF (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_one_id) <> 0
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_round_one_id) <> 1 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:initial_turn_invalid';
  END IF;

  -- A different authenticated user cannot submit the current player's action.
  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.holm_submit_decision(
      v_game_id, v_round_one_id, v_player_one_id, 'stay'
    );
    RAISE EXCEPTION 'holm_atomic_authority_proof:unauthorized_decision_accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'holm_atomic_authority_proof:unauthorized_decision_accepted'
         OR SQLERRM NOT LIKE '%holm_submit_decision:not_participant%' THEN
        RAISE;
      END IF;
  END;

  -- The compatibility entry point still cannot bypass current-turn authority.
  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'authenticated')::text,
    true
  );
  SELECT public.holm_submit_decision(v_game_id, v_player_two_id, 'fold') INTO v_result;
  IF coalesce((v_result->>'not_current_turn')::boolean, false) IS NOT TRUE
     OR EXISTS (
       SELECT 1 FROM public.players
       WHERE id = v_player_two_id AND decision_locked
     )
     OR (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_one_id) <> 0 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:out_of_turn_mutated:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  SELECT decision_deadline INTO v_deadline_before
  FROM public.rounds WHERE id = v_round_one_id;

  SELECT public.holm_submit_decision(
    v_game_id, v_round_one_id, v_player_one_id, 'stay'
  ) INTO v_result;

  IF coalesce((v_result->>'decision_locked')::boolean, false) IS NOT TRUE
     OR coalesce((v_result->>'all_decisions_in')::boolean, true) IS NOT FALSE
     OR (v_result->>'current_turn_position')::integer <> 2
     OR (v_result->>'turn_sequence')::integer <> 1
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_round_one_id) <> 2
     OR (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_one_id) <> 1
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_round_one_id) <= v_deadline_before
     OR NOT EXISTS (
       SELECT 1 FROM public.players
       WHERE id = v_player_one_id
         AND decision_locked
         AND current_decision = 'stay'
     ) THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:turn_not_atomic:%', v_result;
  END IF;

  SELECT public.holm_submit_decision(
    v_game_id, v_round_one_id, v_player_one_id, 'stay'
  ) INTO v_replay;
  IF coalesce((v_replay->>'already_locked')::boolean, false) IS NOT TRUE
     OR (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_one_id) <> 1 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:decision_replay_mutated:%', v_replay;
  END IF;

  SELECT public.holm_submit_decision(
    v_game_id, gen_random_uuid(), v_player_two_id, 'fold'
  ) INTO v_replay;
  IF coalesce((v_replay->>'stale_round')::boolean, false) IS NOT TRUE
     OR (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_one_id) <> 1 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:stale_round_mutated:%', v_replay;
  END IF;

  UPDATE public.games SET is_paused = true WHERE id = v_game_id;
  SELECT public.holm_submit_decision(
    v_game_id, v_round_one_id, v_player_two_id, 'fold'
  ) INTO v_result;
  IF coalesce((v_result->>'game_paused')::boolean, false) IS NOT TRUE
     OR EXISTS (
       SELECT 1 FROM public.players
       WHERE id = v_player_two_id AND decision_locked
     ) THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:paused_action_mutated:%', v_result;
  END IF;
  UPDATE public.games SET is_paused = false WHERE id = v_game_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'service_role')::text,
    true
  );
  SELECT public.holm_apply_deadline_decision(
    v_game_id, v_round_one_id, v_player_two_id, 'fold', true
  ) INTO v_result;
  IF coalesce((v_result->>'deadline_not_expired')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:early_deadline_accepted:%', v_result;
  END IF;

  UPDATE public.rounds
     SET decision_deadline = now() - interval '1 second'
   WHERE id = v_round_one_id;
  SELECT public.holm_apply_deadline_decision(
    v_game_id, v_round_one_id, v_player_two_id, 'fold', true
  ) INTO v_result;

  IF coalesce((v_result->>'deadline_applied')::boolean, false) IS NOT TRUE
     OR coalesce((v_result->>'all_decisions_in')::boolean, false) IS NOT TRUE
     OR (v_result->>'turn_sequence')::integer <> 2
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_round_one_id) IS NOT NULL
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_round_one_id) IS NOT NULL
     OR (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_one_id) <> 2
     OR (SELECT auto_fold FROM public.players WHERE id = v_player_two_id) IS DISTINCT FROM true
     OR (SELECT sit_out_next_hand FROM public.players WHERE id = v_player_two_id) IS DISTINCT FROM true
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:deadline_not_atomic:%', v_result;
  END IF;

  -- Continuation authorization is checked before any successor is published.
  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.proceed_to_next_holm_hand(v_game_id, v_round_one_id);
    RAISE EXCEPTION 'holm_atomic_authority_proof:unauthorized_continuation_accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'holm_atomic_authority_proof:unauthorized_continuation_accepted'
         OR SQLERRM NOT LIKE '%proceed_to_next_holm_hand:not_participant%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  SELECT public.proceed_to_next_holm_hand(
    v_game_id, v_round_one_id
  ) INTO v_result;
  v_round_two_id := (v_result->>'round_id')::uuid;

  IF v_result->>'outcome' <> 'started'
     OR (v_result->>'hand_number')::integer <> 2
     OR (v_result->>'buck_position')::integer <> 2
     OR (SELECT status FROM public.rounds WHERE id = v_round_one_id) <> 'completed'
     OR (SELECT status FROM public.rounds WHERE id = v_round_two_id) <> 'betting'
     OR (SELECT holm_turn_sequence FROM public.rounds WHERE id = v_round_two_id) <> 0
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_round_two_id) <> 2
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 2
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM false
     OR EXISTS (
       SELECT 1 FROM public.players
       WHERE game_id = v_game_id
         AND (decision_locked OR current_decision IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:successor_not_atomic:%', v_result;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.player_cards
  WHERE round_id = v_round_two_id
    AND hand_context_id = v_round_two_id::text
    AND source_version = 1
    AND jsonb_array_length(cards) = 4;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:successor_card_context_count:%', v_count;
  END IF;

  SELECT public.proceed_to_next_holm_hand(
    v_game_id, v_round_one_id
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-started'
     OR (v_replay->>'round_id')::uuid <> v_round_two_id
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:continuation_replay_mutated:%', v_replay;
  END IF;

  UPDATE public.games SET status = 'session_ended' WHERE id = v_game_id;
  SELECT public.proceed_to_next_holm_hand(
    v_game_id, v_round_one_id
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-started'
     OR (v_replay->>'round_id')::uuid <> v_round_two_id
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'session_ended'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:late_replay_mutated_terminal:%', v_replay;
  END IF;

  -- A terminal game with no successor remains terminal and cannot publish one.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - Holm terminal preservation',
    'game_over', 'holm-game', v_terminal_dealer_game_id, v_users[1],
    1, false, 1, 2, false, true
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_terminal_dealer_game_id, v_terminal_game_id, v_users[1], 'holm'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES (
    v_terminal_game_id, v_users[1], 1, 100,
    'active', false, 'ante_up', false
  );
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id, holm_turn_sequence
  ) VALUES (
    v_terminal_round_id, v_terminal_game_id, 1, 4, 'completed', 2,
    1, v_terminal_dealer_game_id, 2
  );

  SELECT public.proceed_to_next_holm_hand(
    v_terminal_game_id, v_terminal_round_id
  ) INTO v_result;
  IF v_result->>'outcome' <> 'rejected'
     OR v_result->>'reason' <> 'terminal-state'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_terminal_game_id) <> 1
     OR (SELECT status FROM public.games WHERE id = v_terminal_game_id) <> 'game_over' THEN
    RAISE EXCEPTION 'holm_atomic_authority_proof:terminal_state_mutated:%', v_result;
  END IF;

  RAISE NOTICE 'holm_atomic_turn_and_continuation_proof:passed';
END;
$proof$;

ROLLBACK;
