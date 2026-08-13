-- Rollback-only proof for the Cribbage counting presentation lease.
-- It creates no persistent production records.
BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_round_id uuid := gen_random_uuid();
  v_successor_id uuid := gen_random_uuid();
  v_fallback_game_id uuid := gen_random_uuid();
  v_fallback_dealer_game_id uuid := gen_random_uuid();
  v_fallback_round_id uuid := gen_random_uuid();
  v_fallback_successor_id uuid := gen_random_uuid();
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_terminal_round_id uuid := gen_random_uuid();
  v_unauthorized_id uuid := gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id) INTO v_users
  FROM (SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege('anon', 'public.activate_prepared_cribbage_hand(uuid,uuid,uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.activate_prepared_cribbage_hand(uuid,uuid,uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cribbage_complete_counting(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cribbage_complete_counting(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:grants_invalid';
  END IF;

  -- Equal scores prove the normal (non-terminal) continuation path.  The
  -- successor has a future display lease and therefore must not go live when
  -- an early browser callback asks to complete counting.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_game_id, 'Codex rollback proof - Cribbage presentation lease',
    'in_progress', 'cribbage', v_dealer_game_id, v_users[1],
    1, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'cribbage');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (
    id, game_id, round_number, hand_number, dealer_game_id,
    cards_dealt, pot, status, cribbage_state
  ) VALUES (
    v_round_id, v_game_id, 1, 1, v_dealer_game_id,
    6, 0, 'betting', jsonb_build_object(
      'phase', 'counting',
      'winnerPlayerId', null,
      'playerStates', jsonb_build_object(
        v_users[1]::text, jsonb_build_object('playerId', v_users[1], 'pegScore', 50, 'hand', '[]'::jsonb),
        v_users[2]::text, jsonb_build_object('playerId', v_users[2], 'pegScore', 50, 'hand', '[]'::jsonb)
      ),
      'countingResolution', jsonb_build_object('version', 1, 'outcome', 'prepared')
    )
  );
  INSERT INTO public.rounds (
    id, game_id, round_number, hand_number, dealer_game_id,
    cards_dealt, pot, status, predecessor_round_id, presentation_fallback_at, cribbage_state
  ) VALUES (
    v_successor_id, v_game_id, 1, 2, v_dealer_game_id,
    6, 0, 'dealing', v_round_id, clock_timestamp() + interval '30 seconds',
    jsonb_build_object('phase', 'discarding')
  );

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.activate_prepared_cribbage_hand(v_game_id, v_round_id, v_successor_id, false);
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:unauthorized_activation_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cribbage_presentation_lease_proof:unauthorized_activation_accepted'
       OR SQLERRM NOT LIKE '%activate_prepared_cribbage_hand:caller_not_in_session%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_result;
  IF v_result->>'outcome' <> 'presentation_pending'
     OR (v_result->>'round_id')::uuid <> v_successor_id
     OR (v_result->>'presentation_release_at')::timestamptz
          <> (SELECT presentation_fallback_at - interval '5 seconds' FROM public.rounds WHERE id = v_successor_id)
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'betting'
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'dealing'
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 1
     OR (SELECT cribbage_state -> 'playerStates' -> v_users[1]::text ->> 'pegScore' FROM public.rounds WHERE id = v_round_id) <> '50'
     OR (SELECT cribbage_state -> 'playerStates' -> v_users[2]::text ->> 'pegScore' FROM public.rounds WHERE id = v_round_id) <> '50' THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:early_ack_mutated_tied_continuation:%', v_result;
  END IF;

  -- A normal acknowledgement at the durable release point activates exactly
  -- once; duplicate and late terminal replays are inert.
  UPDATE public.rounds
     SET presentation_fallback_at = clock_timestamp() + interval '4 seconds'
   WHERE id = v_successor_id;
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_result;
  IF v_result->>'outcome' <> 'activated'
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'completed'
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'betting'
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:release_activation_not_atomic:%', v_result;
  END IF;
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_active'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:duplicate_replay_mutated:%', v_replay;
  END IF;
  UPDATE public.games SET status = 'session_ended' WHERE id = v_game_id;
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_active'
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'session_ended' THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:late_replay_mutated_terminal:%', v_replay;
  END IF;

  -- The service fallback remains rejected before its later recovery deadline,
  -- then activates the exact prepared successor after that deadline.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_fallback_game_id, 'Codex rollback proof - Cribbage fallback lease',
    'in_progress', 'cribbage', v_fallback_dealer_game_id, v_users[1],
    1, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_fallback_dealer_game_id, v_fallback_game_id, v_users[1], 'cribbage');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_fallback_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_fallback_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, hand_number, dealer_game_id, cards_dealt, pot, status, cribbage_state)
  VALUES (
    v_fallback_round_id, v_fallback_game_id, 1, 1, v_fallback_dealer_game_id, 6, 0, 'betting',
    jsonb_build_object('phase', 'counting', 'countingResolution', jsonb_build_object('version', 1, 'outcome', 'prepared'))
  );
  INSERT INTO public.rounds (
    id, game_id, round_number, hand_number, dealer_game_id,
    cards_dealt, pot, status, predecessor_round_id, presentation_fallback_at, cribbage_state
  ) VALUES (
    v_fallback_successor_id, v_fallback_game_id, 1, 2, v_fallback_dealer_game_id,
    6, 0, 'dealing', v_fallback_round_id, clock_timestamp() + interval '30 seconds', jsonb_build_object('phase', 'discarding')
  );
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  SELECT public.activate_prepared_cribbage_hand(
    v_fallback_game_id, v_fallback_round_id, v_fallback_successor_id, true
  ) INTO v_result;
  IF v_result->>'reason' <> 'fallback_not_due'
     OR (SELECT status FROM public.rounds WHERE id = v_fallback_successor_id) <> 'dealing' THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:early_fallback_accepted:%', v_result;
  END IF;
  UPDATE public.rounds SET presentation_fallback_at = clock_timestamp() - interval '1 second'
   WHERE id = v_fallback_successor_id;
  SELECT public.activate_prepared_cribbage_hand(
    v_fallback_game_id, v_fallback_round_id, v_fallback_successor_id, true
  ) INTO v_result;
  IF v_result->>'outcome' <> 'activated'
     OR coalesce((v_result->>'from_fallback')::boolean, false) IS NOT TRUE
     OR (SELECT total_hands FROM public.games WHERE id = v_fallback_game_id) <> 2 THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:fallback_continuation_failed:%', v_result;
  END IF;

  -- A terminal winner remains terminal, creates no successor, and accepts a
  -- late replay without mutating the terminal disposition.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - Cribbage winner terminal',
    'game_over', 'cribbage', v_terminal_dealer_game_id, v_users[1],
    1, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_terminal_dealer_game_id, v_terminal_game_id, v_users[1], 'cribbage');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_terminal_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_terminal_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, hand_number, dealer_game_id, cards_dealt, pot, status, cribbage_state)
  VALUES (
    v_terminal_round_id, v_terminal_game_id, 1, 1, v_terminal_dealer_game_id, 6, 0, 'completed',
    jsonb_build_object(
      'phase', 'complete',
      'winnerPlayerId', v_users[1],
      'playerStates', jsonb_build_object(
        v_users[1]::text, jsonb_build_object('pegScore', 121),
        v_users[2]::text, jsonb_build_object('pegScore', 80)
      ),
      'countingResolution', jsonb_build_object('version', 1, 'outcome', 'terminal')
    )
  );
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_complete_counting(v_terminal_round_id) INTO v_result;
  SELECT public.cribbage_complete_counting(v_terminal_round_id) INTO v_replay;
  IF v_result->>'outcome' <> 'terminal'
     OR v_replay->>'outcome' <> 'terminal'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_terminal_game_id) <> 1
     OR (SELECT cribbage_state ->> 'winnerPlayerId' FROM public.rounds WHERE id = v_terminal_round_id) <> v_users[1]::text THEN
    RAISE EXCEPTION 'cribbage_presentation_lease_proof:winner_terminal_mutated:%/%', v_result, v_replay;
  END IF;

  RAISE NOTICE 'cribbage_counting_presentation_lease_proof:passed';
END;
$proof$;

ROLLBACK;
