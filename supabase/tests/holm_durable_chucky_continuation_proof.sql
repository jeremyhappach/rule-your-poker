-- Rollback-only proof for durable Holm Chucky-loss successor preparation,
-- presentation activation, fallback recovery, authorization, and replay.
BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_round_id uuid := gen_random_uuid();
  v_fallback_game_id uuid := gen_random_uuid();
  v_fallback_dealer_game_id uuid := gen_random_uuid();
  v_fallback_round_id uuid := gen_random_uuid();
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_terminal_round_id uuid := gen_random_uuid();
  v_unauthorized_id uuid := gen_random_uuid();
  v_successor_id uuid;
  v_fallback_successor_id uuid;
  v_result jsonb;
  v_replay jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id) INTO v_users
  FROM (
    SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege('anon', 'public.prepare_next_holm_hand(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.prepare_next_holm_hand(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.activate_prepared_holm_hand(uuid,uuid,uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.activate_prepared_holm_hand(uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:grants_invalid';
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, last_round_result
  ) VALUES (
    v_game_id, 'Codex rollback proof - durable Holm continuation',
    'in_progress', 'holm-game', v_dealer_game_id, v_users[1],
    1, 1, 1, 1, false, 1, 20, false,
    true, 'Chucky beat Proof Player with Straight. -$10'
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, current_decision, decision_locked, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 90, 'active', false, 'ante_up', 'stay', true, false),
    (v_game_id, v_users[2], 5, 100, 'active', false, 'ante_up', 'fold', true, false);
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id, holm_turn_sequence,
    community_cards, community_cards_revealed,
    chucky_active, chucky_cards, chucky_cards_revealed
  ) VALUES (
    v_round_id, v_game_id, 1, 4, 'completed', 20,
    1, v_dealer_game_id, 2,
    '[]'::jsonb, 4, true, '[]'::jsonb, 4
  );

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.prepare_next_holm_hand(v_game_id, v_round_id);
    RAISE EXCEPTION 'holm_durable_continuation_proof:unauthorized_prepare_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'holm_durable_continuation_proof:unauthorized_prepare_accepted'
       OR SQLERRM NOT LIKE '%prepare_next_holm_hand:not_participant%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_game_id, v_round_id) INTO v_result;
  v_successor_id := (v_result->>'round_id')::uuid;

  IF v_result->>'outcome' <> 'prepared'
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'dealing'
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_successor_id) IS NOT NULL
     OR (SELECT pending_turn_position FROM public.rounds WHERE id = v_successor_id) <> 5
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_successor_id) IS NOT NULL
     OR (SELECT holm_predecessor_round_id FROM public.rounds WHERE id = v_successor_id) <> v_round_id
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM true
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 1
     OR (SELECT last_round_result FROM public.games WHERE id = v_game_id) IS NULL
     OR EXISTS (
       SELECT 1 FROM public.players
       WHERE game_id = v_game_id AND decision_locked IS DISTINCT FROM true
     ) THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:preparation_not_non_actionable:%', v_result;
  END IF;

  SELECT public.prepare_next_holm_hand(v_game_id, v_round_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-prepared'
     OR (v_replay->>'round_id')::uuid <> v_successor_id
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:prepare_replay_mutated:%', v_replay;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.activate_prepared_holm_hand(v_game_id, v_round_id, v_successor_id, false);
    RAISE EXCEPTION 'holm_durable_continuation_proof:unauthorized_activation_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'holm_durable_continuation_proof:unauthorized_activation_accepted'
       OR SQLERRM NOT LIKE '%activate_prepared_holm_hand:not_participant%' THEN
      RAISE;
    END IF;
  END;

  UPDATE public.games SET is_paused = true WHERE id = v_game_id;
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.activate_prepared_holm_hand(v_game_id, v_round_id, v_successor_id, false) INTO v_result;
  IF v_result->>'reason' <> 'game-paused'
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'dealing' THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:paused_activation_mutated:%', v_result;
  END IF;
  UPDATE public.games SET is_paused = false WHERE id = v_game_id;

  SELECT public.activate_prepared_holm_hand(v_game_id, v_round_id, v_successor_id, false) INTO v_result;
  IF v_result->>'outcome' <> 'activated'
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'betting'
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_successor_id) <> 5
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_successor_id) IS NULL
     OR (SELECT pending_turn_position FROM public.rounds WHERE id = v_successor_id) IS NOT NULL
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM false
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 2
     OR (SELECT buck_position FROM public.games WHERE id = v_game_id) <> 5
     OR (SELECT last_round_result FROM public.games WHERE id = v_game_id) IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.players
       WHERE game_id = v_game_id AND (decision_locked OR current_decision IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:activation_not_atomic:%', v_result;
  END IF;

  SELECT public.activate_prepared_holm_hand(v_game_id, v_round_id, v_successor_id, false) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-active'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:activation_replay_mutated:%', v_replay;
  END IF;

  UPDATE public.games SET status = 'session_ended' WHERE id = v_game_id;
  SELECT public.prepare_next_holm_hand(v_game_id, v_round_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-active'
     OR (v_replay->>'round_id')::uuid <> v_successor_id
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'session_ended' THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:late_replay_mutated_terminal:%', v_replay;
  END IF;

  -- A second game proves the service lease, including its not-yet-due guard.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, last_round_result
  ) VALUES (
    v_fallback_game_id, 'Codex rollback proof - Holm continuation fallback',
    'in_progress', 'holm-game', v_fallback_dealer_game_id, v_users[1],
    1, 1, 1, 1, false, 1, 20, false, true,
    'Chucky beat Proof Player with Straight. -$10'
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_fallback_dealer_game_id, v_fallback_game_id, v_users[1], 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_fallback_game_id, v_users[1], 1, 90, 'active', false, 'ante_up', false),
    (v_fallback_game_id, v_users[2], 5, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, cards_dealt, status, pot, hand_number, dealer_game_id, holm_turn_sequence)
  VALUES (v_fallback_round_id, v_fallback_game_id, 1, 4, 'completed', 20, 1, v_fallback_dealer_game_id, 2);

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_fallback_game_id, v_fallback_round_id) INTO v_result;
  v_fallback_successor_id := (v_result->>'round_id')::uuid;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  SELECT public.activate_prepared_holm_hand(
    v_fallback_game_id, v_fallback_round_id, v_fallback_successor_id, true
  ) INTO v_result;
  IF v_result->>'reason' <> 'fallback-not-yet-due' THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:early_fallback_accepted:%', v_result;
  END IF;

  UPDATE public.rounds SET presentation_fallback_at = clock_timestamp() - interval '1 second'
  WHERE id = v_fallback_successor_id;
  SELECT public.activate_prepared_holm_hand(
    v_fallback_game_id, v_fallback_round_id, v_fallback_successor_id, true
  ) INTO v_result;
  IF v_result->>'outcome' <> 'activated'
     OR coalesce((v_result->>'from_fallback')::boolean, false) IS NOT TRUE
     OR (SELECT status FROM public.rounds WHERE id = v_fallback_successor_id) <> 'betting'
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_fallback_game_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:fallback_not_atomic:%', v_result;
  END IF;

  -- A terminal game with no successor cannot prepare one.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money, awaiting_next_round
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - Holm prepare terminal',
    'game_over', 'holm-game', v_terminal_dealer_game_id, v_users[1],
    1, 1, 1, 1, false, 1, 2, false, true
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_terminal_dealer_game_id, v_terminal_game_id, v_users[1], 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES (v_terminal_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, cards_dealt, status, pot, hand_number, dealer_game_id, holm_turn_sequence)
  VALUES (v_terminal_round_id, v_terminal_game_id, 1, 4, 'completed', 2, 1, v_terminal_dealer_game_id, 1);

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_terminal_game_id, v_terminal_round_id) INTO v_result;
  IF v_result->>'reason' <> 'terminal-state'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_terminal_game_id) <> 1 THEN
    RAISE EXCEPTION 'holm_durable_continuation_proof:terminal_prepare_mutated:%', v_result;
  END IF;

  RAISE NOTICE 'holm_durable_chucky_continuation_proof:passed';
END;
$proof$;

ROLLBACK;
