-- Rollback-only proof for lazy Cribbage successor creation and release.
-- It creates no persistent production records.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.make_cribbage_counting_state(
  p_player_one uuid,
  p_player_two uuid,
  p_score_one integer,
  p_score_two integer,
  p_hand_one integer,
  p_hand_two integer,
  p_crib integer,
  p_points_to_win integer
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object(
    'phase', 'counting',
    'dealerPlayerId', p_player_two,
    'turnOrder', jsonb_build_array(p_player_one, p_player_two),
    'playerStates', jsonb_build_object(
      p_player_one::text, jsonb_build_object('playerId', p_player_one, 'pegScore', p_score_one, 'hand', '[]'::jsonb),
      p_player_two::text, jsonb_build_object('playerId', p_player_two, 'pegScore', p_score_two, 'hand', '[]'::jsonb)
    ),
    'countingPlan', jsonb_build_object(
      'version', 1,
      'baselineScores', jsonb_build_object(p_player_one::text, p_score_one, p_player_two::text, p_score_two),
      'targets', jsonb_build_array(
        jsonb_build_object(
          'playerId', p_player_one,
          'type', 'hand',
          'comboPoints', CASE WHEN p_hand_one = 0 THEN '[]'::jsonb ELSE jsonb_build_array(p_hand_one) END,
          'totalPoints', p_hand_one
        ),
        jsonb_build_object(
          'playerId', p_player_two,
          'type', 'hand',
          'comboPoints', CASE WHEN p_hand_two = 0 THEN '[]'::jsonb ELSE jsonb_build_array(p_hand_two) END,
          'totalPoints', p_hand_two
        ),
        jsonb_build_object(
          'playerId', p_player_two,
          'type', 'crib',
          'comboPoints', CASE WHEN p_crib = 0 THEN '[]'::jsonb ELSE jsonb_build_array(p_crib) END,
          'totalPoints', p_crib
        )
      )
    ),
    'pointsToWin', p_points_to_win,
    'anteAmount', 1,
    'skunkEnabled', true,
    'skunkThreshold', 91,
    'doubleSkunkEnabled', true,
    'doubleSkunkThreshold', 61
  );
$$;

DO $proof$
DECLARE
  v_users uuid[];
  v_player_one_id uuid := gen_random_uuid();
  v_player_two_id uuid := gen_random_uuid();
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_round_id uuid := gen_random_uuid();
  v_successor_id uuid;
  v_fallback_game_id uuid := gen_random_uuid();
  v_fallback_dealer_game_id uuid := gen_random_uuid();
  v_fallback_round_id uuid := gen_random_uuid();
  v_fallback_successor_id uuid;
  v_fallback_player_one_id uuid := gen_random_uuid();
  v_fallback_player_two_id uuid := gen_random_uuid();
  v_paused_game_id uuid := gen_random_uuid();
  v_paused_dealer_game_id uuid := gen_random_uuid();
  v_paused_round_id uuid := gen_random_uuid();
  v_paused_player_one_id uuid := gen_random_uuid();
  v_paused_player_two_id uuid := gen_random_uuid();
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_terminal_round_id uuid := gen_random_uuid();
  v_terminal_player_one_id uuid := gen_random_uuid();
  v_terminal_player_two_id uuid := gen_random_uuid();
  v_legacy_game_id uuid := gen_random_uuid();
  v_legacy_dealer_game_id uuid := gen_random_uuid();
  v_legacy_round_id uuid := gen_random_uuid();
  v_legacy_successor_id uuid := gen_random_uuid();
  v_legacy_player_one_id uuid := gen_random_uuid();
  v_legacy_player_two_id uuid := gen_random_uuid();
  v_unauthorized_id uuid := gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_state jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id) INTO v_users
  FROM (SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege('anon', 'public.cribbage_release_counting(uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cribbage_release_counting(uuid,boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cribbage_complete_counting(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cribbage_complete_counting(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cribbage_record_counting_progress(uuid,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.cribbage_record_counting_progress(uuid,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:grants_invalid';
  END IF;

  -- Equal baseline scores exercise the full non-terminal scoring path. Counting
  -- finalization must persist score truth and the lease without creating H2.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_game_id, 'Codex rollback proof - Cribbage lazy continuation',
    'in_progress', 'cribbage', v_dealer_game_id, v_users[1],
    2, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[2], 'cribbage');
  INSERT INTO public.players (id, game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_player_one_id, v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_player_two_id, v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);

  v_state := pg_temp.make_cribbage_counting_state(
    v_player_one_id, v_player_two_id, 50, 50, 2, 0, 3, 121
  );
  INSERT INTO public.rounds (
    id, game_id, round_number, hand_number, dealer_game_id,
    cards_dealt, pot, status, cribbage_state
  ) VALUES (
    v_round_id, v_game_id, 1, 1, v_dealer_game_id,
    6, 0, 'betting', v_state
  );

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_finalize_counting(v_round_id) INTO v_result;
  IF v_result->>'outcome' <> 'ready'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 1
     OR (SELECT count(*) FROM public.player_cards WHERE round_id IN (SELECT id FROM public.rounds WHERE game_id = v_game_id)) <> 0
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 1
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'betting'
     OR (SELECT presentation_fallback_at FROM public.rounds WHERE id = v_round_id) IS NULL
     OR (SELECT cribbage_state -> 'countingResolution' ->> 'outcome' FROM public.rounds WHERE id = v_round_id) <> 'ready'
     OR (SELECT cribbage_state -> 'playerStates' -> v_player_one_id::text ->> 'pegScore' FROM public.rounds WHERE id = v_round_id) <> '52'
     OR (SELECT cribbage_state -> 'playerStates' -> v_player_two_id::text ->> 'pegScore' FROM public.rounds WHERE id = v_round_id) <> '53' THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:finalize_created_or_mis-scored_successor:%', v_result;
  END IF;

  -- Reconnect cursor writes are authenticated, monotonic, and mutate only the
  -- cursor. A stale client cannot replace the ready resolution or move the
  -- sequence backward after another client has advanced it.
  SELECT public.cribbage_record_counting_progress(v_round_id, 0, 0) INTO v_result;
  SELECT public.cribbage_record_counting_progress(v_round_id, 1, -1) INTO v_replay;
  IF v_result->>'outcome' <> 'advanced'
     OR v_replay->>'outcome' <> 'advanced'
     OR (SELECT cribbage_state -> 'countingResolution' ->> 'outcome' FROM public.rounds WHERE id = v_round_id) <> 'ready'
     OR (SELECT cribbage_state ->> 'countingTargetIndex' FROM public.rounds WHERE id = v_round_id) <> '1'
     OR (SELECT cribbage_state ->> 'countingBeatIndex' FROM public.rounds WHERE id = v_round_id) <> '-1' THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:cursor_advance_mutated_resolution:%/%', v_result, v_replay;
  END IF;
  SELECT public.cribbage_record_counting_progress(v_round_id, 0, 0) INTO v_replay;
  IF v_replay->>'outcome' <> 'ignored'
     OR (SELECT cribbage_state ->> 'countingTargetIndex' FROM public.rounds WHERE id = v_round_id) <> '1'
     OR (SELECT cribbage_state ->> 'countingBeatIndex' FROM public.rounds WHERE id = v_round_id) <> '-1' THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:cursor_regressed:%', v_replay;
  END IF;

  -- Unauthorized callers cannot release the scored hand.
  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.cribbage_record_counting_progress(v_round_id, 1, 0);
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:unauthorized_cursor_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cribbage_lazy_successor_proof:unauthorized_cursor_accepted'
       OR SQLERRM NOT LIKE '%cribbage_record_counting_progress:caller_not_in_session%' THEN
      RAISE;
    END IF;
  END;
  BEGIN
    PERFORM public.cribbage_release_counting(v_round_id, false);
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:unauthorized_release_accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'cribbage_lazy_successor_proof:unauthorized_release_accepted'
       OR SQLERRM NOT LIKE '%cribbage_release_counting:caller_not_in_session%' THEN
      RAISE;
    END IF;
  END;

  -- An early acknowledgement cannot mint H2. At release, H2, player cards,
  -- predecessor completion, and the game pointer appear atomically.
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_result;
  IF v_result->>'outcome' <> 'presentation_pending'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 1
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 1 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:early_ack_created_successor:%', v_result;
  END IF;

  UPDATE public.rounds
     SET presentation_fallback_at = clock_timestamp() + interval '4 seconds'
   WHERE id = v_round_id;
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_result;
  SELECT id INTO v_successor_id FROM public.rounds WHERE predecessor_round_id = v_round_id;
  IF v_result->>'outcome' <> 'activated'
     OR v_successor_id IS NULL
     OR (v_result->>'round_id')::uuid <> v_successor_id
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'completed'
     OR (SELECT presentation_fallback_at FROM public.rounds WHERE id = v_round_id) IS NOT NULL
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'betting'
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 2
     OR (SELECT count(*) FROM public.player_cards WHERE round_id = v_successor_id) <> 2
     OR EXISTS (SELECT 1 FROM public.player_cards WHERE round_id = v_successor_id AND jsonb_array_length(cards) <> 6) THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:release_not_atomic:%', v_result;
  END IF;

  SELECT public.cribbage_complete_counting(v_round_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_active'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2
     OR (SELECT count(*) FROM public.player_cards WHERE round_id = v_successor_id) <> 2 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:duplicate_replay_mutated:%', v_replay;
  END IF;
  UPDATE public.games SET status = 'session_ended' WHERE id = v_game_id;
  SELECT public.cribbage_complete_counting(v_round_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_active'
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'session_ended' THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:late_replay_mutated_terminal:%', v_replay;
  END IF;

  -- With no browser callback, the service path cannot create a successor early
  -- and creates exactly one once the later fallback lease is due.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_fallback_game_id, 'Codex rollback proof - Cribbage lazy fallback',
    'in_progress', 'cribbage', v_fallback_dealer_game_id, v_users[1],
    2, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_fallback_dealer_game_id, v_fallback_game_id, v_users[2], 'cribbage');
  INSERT INTO public.players (id, game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_fallback_player_one_id, v_fallback_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_fallback_player_two_id, v_fallback_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, hand_number, dealer_game_id, cards_dealt, pot, status, cribbage_state)
  VALUES (
    v_fallback_round_id, v_fallback_game_id, 1, 1, v_fallback_dealer_game_id, 6, 0, 'betting',
    pg_temp.make_cribbage_counting_state(
      v_fallback_player_one_id, v_fallback_player_two_id, 50, 50, 2, 0, 3, 121
    )
  );
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_finalize_counting(v_fallback_round_id) INTO v_result;
  IF v_result->>'outcome' <> 'ready'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_fallback_game_id) <> 1 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:fallback_finalize_created_successor:%', v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  SELECT public.cribbage_release_counting(v_fallback_round_id, true) INTO v_result;
  IF v_result->>'reason' <> 'fallback_not_due'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_fallback_game_id) <> 1 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:early_fallback_created_successor:%', v_result;
  END IF;
  UPDATE public.rounds
     SET presentation_fallback_at = clock_timestamp() - interval '1 second'
   WHERE id = v_fallback_round_id;
  SELECT public.cribbage_release_counting(v_fallback_round_id, true) INTO v_result;
  SELECT id INTO v_fallback_successor_id FROM public.rounds WHERE predecessor_round_id = v_fallback_round_id;
  IF v_result->>'outcome' <> 'activated'
     OR coalesce((v_result->>'from_fallback')::boolean, false) IS NOT TRUE
     OR v_fallback_successor_id IS NULL
     OR (SELECT total_hands FROM public.games WHERE id = v_fallback_game_id) <> 2 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:fallback_continuation_failed:%', v_result;
  END IF;

  -- Pause is a terminal-state guard for continuation: even a due ready hand
  -- remains intact and successor-free until the game is resumed.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win, is_paused
  ) VALUES (
    v_paused_game_id, 'Codex rollback proof - Cribbage paused release',
    'in_progress', 'cribbage', v_paused_dealer_game_id, v_users[1],
    2, 1, 1, false, 1, 0, false, 121, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_paused_dealer_game_id, v_paused_game_id, v_users[2], 'cribbage');
  INSERT INTO public.players (id, game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_paused_player_one_id, v_paused_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_paused_player_two_id, v_paused_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, hand_number, dealer_game_id, cards_dealt, pot, status, cribbage_state)
  VALUES (
    v_paused_round_id, v_paused_game_id, 1, 1, v_paused_dealer_game_id, 6, 0, 'betting',
    pg_temp.make_cribbage_counting_state(
      v_paused_player_one_id, v_paused_player_two_id, 50, 50, 2, 0, 3, 121
    )
  );
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  PERFORM public.cribbage_finalize_counting(v_paused_round_id);
  UPDATE public.rounds SET presentation_fallback_at = clock_timestamp() - interval '1 second' WHERE id = v_paused_round_id;
  UPDATE public.games SET is_paused = true WHERE id = v_paused_game_id;
  SELECT public.cribbage_complete_counting(v_paused_round_id) INTO v_result;
  IF v_result->>'reason' <> 'game_paused'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_paused_game_id) <> 1
     OR (SELECT total_hands FROM public.games WHERE id = v_paused_game_id) <> 1 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:paused_release_mutated:%', v_result;
  END IF;

  -- A terminal winner creates no successor and every replay preserves the
  -- exact terminal state.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - Cribbage winner terminal',
    'in_progress', 'cribbage', v_terminal_dealer_game_id, v_users[1],
    2, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_terminal_dealer_game_id, v_terminal_game_id, v_users[2], 'cribbage');
  INSERT INTO public.players (id, game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_terminal_player_one_id, v_terminal_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_terminal_player_two_id, v_terminal_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  v_state := pg_temp.make_cribbage_counting_state(
    v_terminal_player_one_id, v_terminal_player_two_id, 120, 80, 1, 20, 0, 121
  );
  INSERT INTO public.rounds (id, game_id, round_number, hand_number, dealer_game_id, cards_dealt, pot, status, cribbage_state)
  VALUES (v_terminal_round_id, v_terminal_game_id, 1, 1, v_terminal_dealer_game_id, 6, 0, 'betting', v_state);
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_complete_counting(v_terminal_round_id) INTO v_result;
  SELECT public.cribbage_complete_counting(v_terminal_round_id) INTO v_replay;
  IF v_result->>'outcome' <> 'terminal'
     OR v_replay->>'outcome' <> 'terminal'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_terminal_game_id) <> 1
     OR (SELECT cribbage_state ->> 'phase' FROM public.rounds WHERE id = v_terminal_round_id) <> 'complete'
     OR (SELECT cribbage_state ->> 'winnerPlayerId' FROM public.rounds WHERE id = v_terminal_round_id) <> v_terminal_player_one_id::text THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:winner_terminal_mutated:%/%', v_result, v_replay;
  END IF;

  -- Compatibility: a successor prepared by the previous production function
  -- still activates exactly once through the same public completion RPC.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, current_round, total_hands, is_first_hand,
    ante_amount, pot, real_money, points_to_win
  ) VALUES (
    v_legacy_game_id, 'Codex rollback proof - Cribbage prepared compatibility',
    'in_progress', 'cribbage', v_legacy_dealer_game_id, v_users[1],
    2, 1, 1, false, 1, 0, false, 121
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_legacy_dealer_game_id, v_legacy_game_id, v_users[2], 'cribbage');
  INSERT INTO public.players (id, game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_legacy_player_one_id, v_legacy_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_legacy_player_two_id, v_legacy_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, hand_number, dealer_game_id, cards_dealt, pot, status, cribbage_state)
  VALUES (
    v_legacy_round_id, v_legacy_game_id, 1, 1, v_legacy_dealer_game_id, 6, 0, 'betting',
    jsonb_build_object('phase', 'counting', 'countingResolution', jsonb_build_object('version', 1, 'outcome', 'prepared'))
  );
  INSERT INTO public.rounds (
    id, game_id, round_number, hand_number, dealer_game_id,
    cards_dealt, pot, status, predecessor_round_id, presentation_fallback_at, cribbage_state
  ) VALUES (
    v_legacy_successor_id, v_legacy_game_id, 1, 2, v_legacy_dealer_game_id,
    6, 0, 'dealing', v_legacy_round_id, clock_timestamp() + interval '4 seconds',
    jsonb_build_object('phase', 'discarding')
  );
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  SELECT public.cribbage_complete_counting(v_legacy_round_id) INTO v_result;
  SELECT public.cribbage_complete_counting(v_legacy_round_id) INTO v_replay;
  IF v_result->>'outcome' <> 'activated'
     OR v_replay->>'outcome' <> 'already_active'
     OR (SELECT status FROM public.rounds WHERE id = v_legacy_successor_id) <> 'betting'
     OR (SELECT total_hands FROM public.games WHERE id = v_legacy_game_id) <> 2
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_legacy_game_id) <> 2 THEN
    RAISE EXCEPTION 'cribbage_lazy_successor_proof:prepared_compatibility_failed:%/%', v_result, v_replay;
  END IF;

  RAISE NOTICE 'cribbage_lazy_successor_proof:passed';
END;
$proof$;

ROLLBACK;
