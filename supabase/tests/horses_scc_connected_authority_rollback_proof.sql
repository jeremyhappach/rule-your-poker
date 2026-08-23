-- Complete rollback proof for connected Horses / Ship-Captain-Crew authority.
-- Covers winner, connected tie, duplicate, peer replay, late replay,
-- authorization, continuation, terminal state, canonical-timer recovery,
-- and rejection of game_over without exact settlement.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid := gen_random_uuid();
  v_game uuid := gen_random_uuid();
  v_dealer_game uuid := gen_random_uuid();
  v_round uuid;
  v_winner uuid;
  v_other uuid;
  v_tie_game uuid := gen_random_uuid();
  v_tie_dealer_game uuid := gen_random_uuid();
  v_tie_round uuid;
  v_tie_one uuid;
  v_tie_two uuid;
  v_scc_game uuid := gen_random_uuid();
  v_scc_dealer_game uuid := gen_random_uuid();
  v_scc_round uuid;
  v_scc_one uuid;
  v_scc_two uuid;
  v_timer_game uuid := gen_random_uuid();
  v_timer_dealer_game uuid := gen_random_uuid();
  v_timer_round uuid;
  v_timer_one uuid;
  v_timer_two uuid;
  v_unsettled_game uuid := gen_random_uuid();
  v_unsettled_dealer_game uuid := gen_random_uuid();
  v_unsettled_round uuid := gen_random_uuid();
  v_unsettled_one uuid;
  v_unsettled_two uuid;
  v_state jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_count integer;
  v_before_count integer;
  v_before_chips integer;
  v_error text;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at
        FROM public.profiles
       ORDER BY created_at, id
       LIMIT 2
    ) available;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege(
       'public',
       'public.horses_scc_advance_completed_round(uuid,uuid,uuid,integer)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.horses_scc_advance_completed_round(uuid,uuid,uuid,integer)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.horses_scc_advance_completed_round(uuid,uuid,uuid,integer)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'public',
       'public.horses_scc_advance_postgame(uuid,uuid,uuid,integer)'::regprocedure,
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.horses_scc_advance_postgame(uuid,uuid,uuid,integer)'::regprocedure,
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.horses_scc_advance_postgame(uuid,uuid,uuid,integer)'::regprocedure,
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:wrapper_grants_invalid';
  END IF;

  UPDATE public.system_settings
     SET value = jsonb_build_object('enabled', false)
   WHERE key = 'make_it_take_it';

  -- Connected Horses winner: exact completion settles once, outsider cannot
  -- mutate it, and connected presentation advances before legacy browser work.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, ante_amount, total_hands, current_round, pot,
    game_setup_timer_seconds, real_money
  ) VALUES (
    v_game, 'Codex rollback proof - Horses connected winner', 'in_progress',
    'horses', v_dealer_game, v_users[1], 1, 5, 1, 1, 10, 30, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game, v_game, v_users[1], 'horses');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot, created_at
  ) VALUES
    (v_game, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_game, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_winner FROM public.players WHERE game_id = v_game AND position = 1;
  SELECT id INTO v_other FROM public.players WHERE game_id = v_game AND position = 2;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, status, last_heartbeat_at
  ) VALUES
    (v_users[1], 'connected-authority-winner-one', v_game, 'active', clock_timestamp()),
    (v_users[2], 'connected-authority-winner-two', v_game, 'active', clock_timestamp());
  v_state := jsonb_build_object(
    'gamePhase', 'complete',
    'currentTurnPlayerId', NULL,
    'turnDeadline', NULL,
    'turnOrder', jsonb_build_array(v_winner, v_other),
    'playerStates', jsonb_build_object(
      v_winner::text, jsonb_build_object(
        'isComplete', true, 'rollsRemaining', 0,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 2, 'isHeld', true),
          jsonb_build_object('value', 3, 'isHeld', true)
        )
      ),
      v_other::text, jsonb_build_object(
        'isComplete', true, 'rollsRemaining', 0,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 5, 'isHeld', true),
          jsonb_build_object('value', 5, 'isHeld', true),
          jsonb_build_object('value', 2, 'isHeld', true),
          jsonb_build_object('value', 3, 'isHeld', true),
          jsonb_build_object('value', 4, 'isHeld', true)
        )
      )
    )
  );
  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (v_game, v_dealer_game, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_round;

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.horses_scc_advance_completed_round(
      v_game, v_round, v_dealer_game, 1
    );
    RAISE EXCEPTION 'horses_scc_connected_proof:completion_authorization_bypassed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'horses_scc_connected_proof:completion_authorization_bypassed'
       OR SQLERRM NOT LIKE '%horses_scc_advance_completed_round:not_in_session%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT status FROM public.games WHERE id = v_game) <> 'in_progress'
     OR (SELECT chips FROM public.players WHERE id = v_winner) <> 95
     OR (SELECT pot FROM public.games WHERE id = v_game) <> 10 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:unauthorized_completion_mutated';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  SELECT public.horses_scc_advance_completed_round(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_result;
  IF v_result->>'status' <> 'settled'
     OR v_result->>'transition' <> 'terminal_settlement'
     OR v_result->>'terminal_disposition' <> 'game_over'
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'game_over'
     OR (SELECT chips FROM public.players WHERE id = v_winner) <> 105
     OR (SELECT pot FROM public.games WHERE id = v_game) <> 0 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:winner_settlement_failed:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.horses_scc_advance_postgame(
      v_game, v_round, v_dealer_game, 1
    );
    RAISE EXCEPTION 'horses_scc_connected_proof:postgame_authorization_bypassed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'horses_scc_connected_proof:postgame_authorization_bypassed'
       OR SQLERRM NOT LIKE '%horses_scc_advance_postgame:not_in_session%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT status FROM public.games WHERE id = v_game) <> 'game_over'
     OR EXISTS (
       SELECT 1 FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_game
     ) THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:unauthorized_postgame_mutated';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  SELECT public.horses_scc_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_result;
  IF v_result->>'outcome' <> 'advanced'
     OR v_result->>'status' <> 'game_selection'
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'game_selection'
     OR (SELECT current_game_uuid FROM public.games WHERE id = v_game) IS NOT NULL
     OR (SELECT dealer_position FROM public.games WHERE id = v_game) <> 2 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:continuation_failed:%', v_result;
  END IF;
  SELECT public.horses_scc_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_advanced'
     OR coalesce((v_replay->>'deduped')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:duplicate_postgame_failed:%', v_replay;
  END IF;
  SELECT public.horses_scc_advance_completed_round(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'status' <> 'already_settled' THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:late_completion_replay_failed:%', v_replay;
  END IF;

  -- A later dealer game cannot be cleared by an old postgame replay.
  UPDATE public.games
     SET status = 'in_progress',
         current_game_uuid = gen_random_uuid(),
         total_hands = 7,
         current_round = 1
   WHERE id = v_game;
  SELECT public.horses_scc_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_advanced'
     OR (SELECT total_hands FROM public.games WHERE id = v_game) <> 7
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'in_progress' THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:late_postgame_crossed_boundary:%', v_replay;
  END IF;

  -- Connected tie with live heartbeats advances atomically; no absent-human
  -- lease or browser multi-write chain is required.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, ante_amount, total_hands, current_round, pot, real_money
  ) VALUES (
    v_tie_game, 'Codex rollback proof - Horses connected tie', 'in_progress',
    'horses', v_tie_dealer_game, v_users[1], 1, 1, 1, 1, 10, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_tie_dealer_game, v_tie_game, v_users[1], 'horses');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot, created_at
  ) VALUES
    (v_tie_game, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_tie_game, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_tie_one FROM public.players WHERE game_id = v_tie_game AND position = 1;
  SELECT id INTO v_tie_two FROM public.players WHERE game_id = v_tie_game AND position = 2;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, status, last_heartbeat_at
  ) VALUES
    (v_users[1], 'connected-authority-tie-one', v_tie_game, 'active', clock_timestamp()),
    (v_users[2], 'connected-authority-tie-two', v_tie_game, 'active', clock_timestamp());
  v_state := jsonb_build_object(
    'gamePhase', 'complete',
    'currentTurnPlayerId', NULL,
    'turnDeadline', NULL,
    'turnOrder', jsonb_build_array(v_tie_one, v_tie_two),
    'playerStates', jsonb_build_object(
      v_tie_one::text, jsonb_build_object(
        'isComplete', true, 'rollsRemaining', 0,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 2, 'isHeld', true),
          jsonb_build_object('value', 3, 'isHeld', true)
        )
      ),
      v_tie_two::text, jsonb_build_object(
        'isComplete', true, 'rollsRemaining', 0,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 2, 'isHeld', true),
          jsonb_build_object('value', 3, 'isHeld', true)
        )
      )
    )
  );
  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (v_tie_game, v_tie_dealer_game, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_tie_round;

  SELECT public.horses_scc_advance_completed_round(
    v_tie_game, v_tie_round, v_tie_dealer_game, 1
  ) INTO v_result;
  IF v_result->>'status' <> 'advanced'
     OR v_result->>'transition' <> 'tie_rollover'
     OR (v_result->>'hand_number')::integer <> 2
     OR (v_result->>'pot')::integer <> 12
     OR (SELECT total_hands FROM public.games WHERE id = v_tie_game) <> 2
     OR (SELECT pot FROM public.games WHERE id = v_tie_game) <> 12
     OR (SELECT chips FROM public.players WHERE id = v_tie_one) <> 94
     OR (SELECT chips FROM public.players WHERE id = v_tie_two) <> 94 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:connected_tie_failed:%', v_result;
  END IF;
  SELECT count(*) INTO v_before_count
    FROM public.game_results result
   WHERE result.game_id = v_tie_game;

  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'authenticated')::text,
    true
  );
  SELECT public.horses_scc_advance_completed_round(
    v_tie_game, v_tie_round, v_tie_dealer_game, 1
  ) INTO v_replay;
  SELECT count(*) INTO v_count
    FROM public.game_results result
   WHERE result.game_id = v_tie_game;
  IF v_replay->>'status' <> 'already_advanced'
     OR v_replay->>'transition' <> 'tie_rollover'
     OR v_count <> v_before_count
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_tie_game) <> 2 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:tie_peer_replay_failed:%', v_replay;
  END IF;
  IF (
    SELECT count(*) FROM public.game_results result
     WHERE result.game_id = v_tie_game
       AND result.dealer_game_id = v_tie_dealer_game
       AND result.hand_number = 1
       AND result.is_chopped = true
  ) <> 1
     OR (
       SELECT count(*) FROM public.game_results result
        WHERE result.game_id = v_tie_game
          AND result.dealer_game_id = v_tie_dealer_game
          AND result.hand_number = 2
          AND result.winning_hand_description = 'Re-Ante (Rollover)'
     ) <> 1 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:tie_result_identity_invalid';
  END IF;

  -- SCC keeps its separate evaluator and pending LAST HAND still terminates
  -- directly in the settlement owner without a postgame transition.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, ante_amount, total_hands, current_round, pot,
    pending_session_end, real_money
  ) VALUES (
    v_scc_game, 'Codex rollback proof - SCC terminal', 'in_progress',
    'ship-captain-crew', v_scc_dealer_game, v_users[1], 1, 5, 1, 1, 10,
    true, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_scc_dealer_game, v_scc_game, v_users[1], 'ship-captain-crew');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot, created_at
  ) VALUES
    (v_scc_game, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_scc_game, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_scc_one FROM public.players WHERE game_id = v_scc_game AND position = 1;
  SELECT id INTO v_scc_two FROM public.players WHERE game_id = v_scc_game AND position = 2;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, status, last_heartbeat_at
  ) VALUES
    (v_users[1], 'connected-authority-scc-one', v_scc_game, 'active', clock_timestamp()),
    (v_users[2], 'connected-authority-scc-two', v_scc_game, 'active', clock_timestamp());
  v_state := jsonb_build_object(
    'gamePhase', 'complete',
    'turnOrder', jsonb_build_array(v_scc_one, v_scc_two),
    'playerStates', jsonb_build_object(
      v_scc_one::text, jsonb_build_object(
        'isComplete', true,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 6, 'isHeld', true, 'isSCC', true, 'sccType', 'ship'),
          jsonb_build_object('value', 5, 'isHeld', true, 'isSCC', true, 'sccType', 'captain'),
          jsonb_build_object('value', 4, 'isHeld', true, 'isSCC', true, 'sccType', 'crew'),
          jsonb_build_object('value', 6, 'isHeld', true, 'isSCC', false),
          jsonb_build_object('value', 6, 'isHeld', true, 'isSCC', false)
        )
      ),
      v_scc_two::text, jsonb_build_object(
        'isComplete', true,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 3, 'isHeld', true, 'isSCC', false),
          jsonb_build_object('value', 3, 'isHeld', true, 'isSCC', false),
          jsonb_build_object('value', 2, 'isHeld', true, 'isSCC', false),
          jsonb_build_object('value', 2, 'isHeld', true, 'isSCC', false),
          jsonb_build_object('value', 1, 'isHeld', true, 'isSCC', false)
        )
      )
    )
  );
  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (v_scc_game, v_scc_dealer_game, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_scc_round;
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  SELECT public.horses_scc_advance_completed_round(
    v_scc_game, v_scc_round, v_scc_dealer_game, 1
  ) INTO v_result;
  IF v_result->>'status' <> 'settled'
     OR v_result->>'terminal_disposition' <> 'session_ended'
     OR (SELECT status FROM public.games WHERE id = v_scc_game) <> 'session_ended'
     OR (SELECT chips FROM public.players WHERE id = v_scc_one) <> 105
     OR (SELECT pot FROM public.games WHERE id = v_scc_game) <> 0 THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:scc_terminal_failed:%', v_result;
  END IF;

  -- Full canonical timer recovery uses the same hardened postgame owner.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, ante_amount, total_hands, current_round, pot,
    game_setup_timer_seconds, real_money
  ) VALUES (
    v_timer_game, 'Codex rollback proof - dice timer recovery', 'in_progress',
    'horses', v_timer_dealer_game, v_users[1], 1, 5, 1, 1, 10, 30, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_timer_dealer_game, v_timer_game, v_users[1], 'horses');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot, created_at
  ) VALUES
    (v_timer_game, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_timer_game, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_timer_one FROM public.players WHERE game_id = v_timer_game AND position = 1;
  SELECT id INTO v_timer_two FROM public.players WHERE game_id = v_timer_game AND position = 2;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, status, last_heartbeat_at
  ) VALUES
    (v_users[1], 'connected-authority-timer-one', v_timer_game, 'active', clock_timestamp()),
    (v_users[2], 'connected-authority-timer-two', v_timer_game, 'active', clock_timestamp());
  v_state := jsonb_build_object(
    'gamePhase', 'complete',
    'turnOrder', jsonb_build_array(v_timer_one, v_timer_two),
    'playerStates', jsonb_build_object(
      v_timer_one::text, jsonb_build_object(
        'isComplete', true,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 6, 'isHeld', true),
          jsonb_build_object('value', 2, 'isHeld', true),
          jsonb_build_object('value', 3, 'isHeld', true)
        )
      ),
      v_timer_two::text, jsonb_build_object(
        'isComplete', true,
        'dice', jsonb_build_array(
          jsonb_build_object('value', 5, 'isHeld', true),
          jsonb_build_object('value', 5, 'isHeld', true),
          jsonb_build_object('value', 2, 'isHeld', true),
          jsonb_build_object('value', 3, 'isHeld', true),
          jsonb_build_object('value', 4, 'isHeld', true)
        )
      )
    )
  );
  INSERT INTO public.rounds (
    game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (v_timer_game, v_timer_dealer_game, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_timer_round;
  SELECT public.horses_scc_advance_completed_round(
    v_timer_game, v_timer_round, v_timer_dealer_game, 1
  ) INTO v_result;
  IF v_result->>'status' <> 'settled' THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:timer_fixture_settlement_failed:%', v_result;
  END IF;
  UPDATE private.game_timer_registry timer
     SET due_at = timestamptz '2000-01-01 00:00:00+00',
         state = 'scheduled',
         last_attempt_at = NULL,
         completed_at = NULL,
         last_error = NULL
   WHERE timer.game_id = v_timer_game
     AND timer.timer_kind = 'standard_postgame';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:standard_postgame_timer_missing';
  END IF;
  PERFORM private.advance_due_canonical_game_timers(1);
  IF (SELECT status FROM public.games WHERE id = v_timer_game) <> 'game_selection'
     OR NOT EXISTS (
       SELECT 1 FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_timer_game
          AND claim.dealer_game_id = v_timer_dealer_game
          AND claim.hand_number = 1
     ) THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:canonical_timer_recovery_failed';
  END IF;

  -- game_over is not sufficient admission without the exact terminal result.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, ante_amount, total_hands, current_round, pot, real_money
  ) VALUES (
    v_unsettled_game, 'Codex rollback proof - unsettled dice game_over',
    'game_over', 'horses', v_unsettled_dealer_game, v_users[1],
    1, 5, 1, 1, 10, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_unsettled_dealer_game, v_unsettled_game, v_users[1], 'horses');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_unsettled_game, v_users[1], 1, 95, 'active', false, false),
    (v_unsettled_game, v_users[2], 2, 95, 'active', false, false);
  SELECT id INTO v_unsettled_one FROM public.players WHERE game_id = v_unsettled_game AND position = 1;
  SELECT id INTO v_unsettled_two FROM public.players WHERE game_id = v_unsettled_game AND position = 2;
  v_state := jsonb_build_object(
    'gamePhase', 'complete',
    'turnOrder', jsonb_build_array(v_unsettled_one, v_unsettled_two),
    'playerStates', jsonb_build_object(
      v_unsettled_one::text, jsonb_build_object('isComplete', true, 'dice', '[]'::jsonb),
      v_unsettled_two::text, jsonb_build_object('isComplete', true, 'dice', '[]'::jsonb)
    )
  );
  INSERT INTO public.rounds (
    id, game_id, dealer_game_id, hand_number, round_number,
    cards_dealt, status, pot, horses_state
  ) VALUES (
    v_unsettled_round, v_unsettled_game, v_unsettled_dealer_game,
    1, 1, 2, 'completed', 10, v_state
  );
  v_before_chips := (SELECT chips FROM public.players WHERE id = v_unsettled_one);
  BEGIN
    PERFORM public.horses_scc_advance_postgame(
      v_unsettled_game, v_unsettled_round, v_unsettled_dealer_game, 1
    );
    RAISE EXCEPTION 'horses_scc_connected_proof:unsettled_postgame_admitted';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    IF v_error = 'horses_scc_connected_proof:unsettled_postgame_admitted'
       OR v_error NOT LIKE '%advance_standard_postgame:dice_settlement_not_committed:0%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT status FROM public.games WHERE id = v_unsettled_game) <> 'game_over'
     OR (SELECT pot FROM public.games WHERE id = v_unsettled_game) <> 10
     OR (SELECT chips FROM public.players WHERE id = v_unsettled_one) <> v_before_chips
     OR EXISTS (
       SELECT 1 FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_unsettled_game
     ) THEN
    RAISE EXCEPTION 'horses_scc_connected_proof:unsettled_rejection_mutated';
  END IF;
END;
$proof$;

ROLLBACK;
