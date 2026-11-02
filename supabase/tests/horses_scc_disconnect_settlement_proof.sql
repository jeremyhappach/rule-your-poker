-- Rollback-only proof for Horses/SCC disconnect-safe settlement.
-- Run only in a disposable local database: the partial-roll case temporarily
-- instruments the randomness boundary. Nothing survives ROLLBACK.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid := gen_random_uuid();
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_round_id uuid;
  v_player_one uuid;
  v_player_two uuid;
  v_state jsonb;
  v_result jsonb;
  v_count integer;
  v_tie_game_id uuid := gen_random_uuid();
  v_tie_dealer_game_id uuid := gen_random_uuid();
  v_tie_round_id uuid;
  v_tie_player_one uuid;
  v_tie_player_two uuid;
  v_scc_game_id uuid := gen_random_uuid();
  v_scc_dealer_game_id uuid := gen_random_uuid();
  v_scc_round_id uuid;
  v_scc_player_one uuid;
  v_scc_player_two uuid;
  v_timeout_game_id uuid := gen_random_uuid();
  v_timeout_dealer_game_id uuid := gen_random_uuid();
  v_timeout_round_id uuid;
  v_timeout_player_one uuid;
  v_timeout_player_two uuid;
  v_random_definition text;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2
    ) AS available_users;
  IF COALESCE(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:requires_two_profiles';
  END IF;

  -- A connected normal Horses winner settles exactly once and remains at the
  -- dealer-game continuation boundary rather than ending the whole session.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    ante_amount, total_hands, current_round, pot, real_money
  ) VALUES (
    v_game_id, 'Codex Horses settlement proof', 'in_progress', 'horses',
    v_dealer_game_id, v_users[1], 5, 1, 1, 10, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'horses');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, is_bot, created_at)
  VALUES
    (v_game_id, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_game_id, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_player_one FROM public.players WHERE game_id = v_game_id AND position = 1;
  SELECT id INTO v_player_two FROM public.players WHERE game_id = v_game_id AND position = 2;
  INSERT INTO public.voice_presence_heartbeats (user_id, tab_id, game_id, status, last_heartbeat_at)
  VALUES
    (v_users[1], 'horses-proof-one', v_game_id, 'active', clock_timestamp()),
    (v_users[2], 'horses-proof-two', v_game_id, 'active', clock_timestamp());
  v_state := jsonb_build_object(
    'gamePhase', 'complete',
    'currentTurnPlayerId', NULL,
    'turnDeadline', NULL,
    'turnOrder', jsonb_build_array(v_player_one, v_player_two),
    'playerStates', jsonb_build_object(
      v_player_one::text, jsonb_build_object('isComplete', true, 'rollsRemaining', 0, 'dice', jsonb_build_array(
        jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true),
        jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 2, 'isHeld', true),
        jsonb_build_object('value', 3, 'isHeld', true)
      )),
      v_player_two::text, jsonb_build_object('isComplete', true, 'rollsRemaining', 0, 'dice', jsonb_build_array(
        jsonb_build_object('value', 5, 'isHeld', true), jsonb_build_object('value', 5, 'isHeld', true),
        jsonb_build_object('value', 2, 'isHeld', true), jsonb_build_object('value', 3, 'isHeld', true),
        jsonb_build_object('value', 4, 'isHeld', true)
      ))
    )
  );
  INSERT INTO public.rounds (game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot, horses_state)
  VALUES (v_game_id, v_dealer_game_id, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_round_id;

  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.horses_settle_game(v_game_id, v_round_id, v_dealer_game_id, 1);
    RAISE EXCEPTION 'horses_scc_disconnect_proof:authorization_bypassed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'horses_scc_disconnect_proof:authorization_bypassed'
       OR SQLERRM NOT LIKE '%horses_settle_game:caller_not_in_session%' THEN
      RAISE;
    END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);

  SELECT public.horses_settle_game(v_game_id, v_round_id, v_dealer_game_id, 1) INTO v_result;
  IF v_result ->> 'status' <> 'settled'
     OR v_result ->> 'terminal_disposition' <> 'game_over'
     OR (SELECT chips FROM public.players WHERE id = v_player_one) <> 105
     OR (SELECT chips FROM public.players WHERE id = v_player_two) <> 95
     OR (SELECT pot FROM public.games WHERE id = v_game_id) <> 0
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'game_over' THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:connected_winner_settlement_invalid:%', v_result;
  END IF;
  SELECT public.horses_settle_game(v_game_id, v_round_id, v_dealer_game_id, 1) INTO v_result;
  SELECT count(*) INTO v_count FROM public.game_results
   WHERE dealer_game_id = v_dealer_game_id AND hand_number = 1 AND settlement_key = 'horses_terminal';
  IF v_result ->> 'status' <> 'already_settled' OR v_count <> 1
     OR (SELECT chips FROM public.players WHERE id = v_player_one) <> 105 THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:duplicate_or_late_replay_changed_state:%', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.session_player_snapshots
     WHERE game_id = v_game_id AND dealer_game_id = v_dealer_game_id
       AND hand_number = 1 AND player_id = v_player_one AND chips = 105
  ) THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:post_payout_snapshot_missing';
  END IF;

  -- A single disconnected player becomes auto-roll, while a live opponent
  -- prevents session end and retains their normal turn.
  INSERT INTO public.games (id, name, status, game_type, current_game_uuid, current_host, ante_amount, total_hands, current_round, pot, real_money)
  VALUES (v_timeout_game_id, 'Codex Horses timeout proof', 'in_progress', 'horses', v_timeout_dealer_game_id, v_users[1], 5, 1, 1, 10, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_timeout_dealer_game_id, v_timeout_game_id, v_users[1], 'horses');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, is_bot, created_at)
  VALUES
    (v_timeout_game_id, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_timeout_game_id, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_timeout_player_one FROM public.players WHERE game_id = v_timeout_game_id AND position = 1;
  SELECT id INTO v_timeout_player_two FROM public.players WHERE game_id = v_timeout_game_id AND position = 2;
  INSERT INTO public.voice_presence_heartbeats (user_id, tab_id, game_id, status, last_heartbeat_at)
  VALUES (v_users[2], 'horses-timeout-live', v_timeout_game_id, 'active', clock_timestamp());
  v_state := jsonb_build_object(
    'gamePhase', 'playing', 'currentTurnPlayerId', v_timeout_player_one,
    'turnDeadline', clock_timestamp() - interval '1 second',
    'turnOrder', jsonb_build_array(v_timeout_player_one, v_timeout_player_two),
    'playerStates', jsonb_build_object(
      v_timeout_player_one::text, jsonb_build_object('isComplete', false, 'rollsRemaining', 3, 'dice', jsonb_build_array(
        jsonb_build_object('value', 0, 'isHeld', false), jsonb_build_object('value', 0, 'isHeld', false),
        jsonb_build_object('value', 0, 'isHeld', false), jsonb_build_object('value', 0, 'isHeld', false),
        jsonb_build_object('value', 0, 'isHeld', false)
      )),
      v_timeout_player_two::text, jsonb_build_object('isComplete', false, 'rollsRemaining', 3, 'dice', jsonb_build_array(
        jsonb_build_object('value', 0, 'isHeld', false), jsonb_build_object('value', 0, 'isHeld', false),
        jsonb_build_object('value', 0, 'isHeld', false), jsonb_build_object('value', 0, 'isHeld', false),
        jsonb_build_object('value', 0, 'isHeld', false)
      ))
    )
  );
  INSERT INTO public.rounds (game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot, horses_state)
  VALUES (v_timeout_game_id, v_timeout_dealer_game_id, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_timeout_round_id;
  SELECT private.advance_horses_scc_expired_turn(v_timeout_round_id, clock_timestamp()) INTO v_result;
  IF v_result ->> 'status' <> 'advanced_turn'
     OR NOT (SELECT auto_fold AND sit_out_next_hand FROM public.players WHERE id = v_timeout_player_one)
     OR (SELECT horses_state ->> 'currentTurnPlayerId' FROM public.rounds WHERE id = v_timeout_round_id) <> v_timeout_player_two::text
     OR (SELECT status FROM public.games WHERE id = v_timeout_game_id) <> 'in_progress' THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:single_disconnect_timeout_invalid:%', v_result;
  END IF;

  -- A partial human turn gets only its persisted final roll. setseed() cannot
  -- control secure_random_int. Spy on that boundary in this rollback-only
  -- fixture: return a non-wild, non-target die so an erroneous three-roll loop
  -- cannot stop early. Restore the exact definition before other scenarios.
  SELECT pg_get_functiondef('private.secure_random_int(integer)'::regprocedure)
    INTO v_random_definition;
  CREATE TEMP TABLE horses_partial_roll_calls(bound integer) ON COMMIT DROP;
  EXECUTE $replacement$
    CREATE OR REPLACE FUNCTION private.secure_random_int(p_bound integer)
    RETURNS integer LANGUAGE plpgsql SET search_path TO '' AS $rng$
    BEGIN
      INSERT INTO pg_temp.horses_partial_roll_calls VALUES (p_bound);
      RETURN 1; -- zero-based value: die face 2, never held with four sixes
    END $rng$
  $replacement$;
  UPDATE public.rounds
     SET horses_state = jsonb_build_object(
       'gamePhase', 'playing', 'currentTurnPlayerId', v_timeout_player_two,
       'turnDeadline', clock_timestamp() - interval '1 second',
       'turnOrder', jsonb_build_array(v_timeout_player_one, v_timeout_player_two),
       'playerStates', jsonb_build_object(
         v_timeout_player_one::text, horses_state -> 'playerStates' -> v_timeout_player_one::text,
         v_timeout_player_two::text, jsonb_build_object('isComplete', false, 'rollsRemaining', 1, 'dice', jsonb_build_array(
           jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true),
           jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true),
           jsonb_build_object('value', 2, 'isHeld', false)
         ))
       )
     )
   WHERE id = v_timeout_round_id;
  SELECT private.advance_horses_scc_expired_turn(v_timeout_round_id, clock_timestamp()) INTO v_result;
  EXECUTE v_random_definition;
  IF (SELECT (horses_state -> 'playerStates' -> v_timeout_player_two::text -> 'dice' -> 4 ->> 'value')::integer
        FROM public.rounds WHERE id = v_timeout_round_id) IS DISTINCT FROM 2
     OR (SELECT count(*) FROM pg_temp.horses_partial_roll_calls) <> 1
     OR EXISTS (SELECT 1 FROM pg_temp.horses_partial_roll_calls WHERE bound <> 6)
     OR EXISTS (
       SELECT 1 FROM public.rounds r,
         jsonb_array_elements(r.horses_state -> 'playerStates' -> v_timeout_player_two::text -> 'dice') WITH ORDINALITY d(die, position)
       WHERE r.id = v_timeout_round_id AND d.position <= 4
         AND (d.die ->> 'value' IS DISTINCT FROM '6' OR d.die ->> 'isHeld' IS DISTINCT FROM 'true')
     ) THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:partial_turn_received_extra_roll:%', v_result;
  END IF;

  -- With no heartbeats, a tie rolls into the successor hand. That successor
  -- then settles and closes the session without any browser participation.
  INSERT INTO public.games (id, name, status, game_type, current_game_uuid, current_host, ante_amount, total_hands, current_round, pot, real_money)
  VALUES (v_tie_game_id, 'Codex Horses all-absent tie proof', 'in_progress', 'horses', v_tie_dealer_game_id, v_users[1], 1, 1, 1, 10, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_tie_dealer_game_id, v_tie_game_id, v_users[1], 'horses');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, is_bot, created_at)
  VALUES
    (v_tie_game_id, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_tie_game_id, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_tie_player_one FROM public.players WHERE game_id = v_tie_game_id AND position = 1;
  SELECT id INTO v_tie_player_two FROM public.players WHERE game_id = v_tie_game_id AND position = 2;
  v_state := jsonb_build_object(
    'gamePhase', 'complete', 'turnOrder', jsonb_build_array(v_tie_player_one, v_tie_player_two),
    'playerStates', jsonb_build_object(
      v_tie_player_one::text, jsonb_build_object('isComplete', true, 'dice', jsonb_build_array(
        jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 2, 'isHeld', true), jsonb_build_object('value', 3, 'isHeld', true)
      )),
      v_tie_player_two::text, jsonb_build_object('isComplete', true, 'dice', jsonb_build_array(
        jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 2, 'isHeld', true), jsonb_build_object('value', 3, 'isHeld', true)
      ))
    )
  );
  INSERT INTO public.rounds (game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot, horses_state)
  VALUES (v_tie_game_id, v_tie_dealer_game_id, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_tie_round_id;
  SELECT private.advance_horses_scc_expired_turn(v_tie_round_id, clock_timestamp()) INTO v_result;
  IF v_result ->> 'status' <> 'advanced'
     OR (SELECT total_hands FROM public.games WHERE id = v_tie_game_id) <> 2
     OR (SELECT pot FROM public.games WHERE id = v_tie_game_id) <> 12 THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:all_absent_tie_rollover_invalid:%', v_result;
  END IF;
  SELECT id INTO v_tie_round_id FROM public.rounds
   WHERE game_id = v_tie_game_id AND hand_number = 2;
  UPDATE public.rounds
     SET horses_state = jsonb_build_object(
       'gamePhase', 'complete', 'turnOrder', jsonb_build_array(v_tie_player_one, v_tie_player_two),
       'playerStates', jsonb_build_object(
         v_tie_player_one::text, jsonb_build_object('isComplete', true, 'dice', jsonb_build_array(
           jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 6, 'isHeld', true), jsonb_build_object('value', 2, 'isHeld', true)
         )),
         v_tie_player_two::text, jsonb_build_object('isComplete', true, 'dice', jsonb_build_array(
           jsonb_build_object('value', 5, 'isHeld', true), jsonb_build_object('value', 5, 'isHeld', true), jsonb_build_object('value', 2, 'isHeld', true), jsonb_build_object('value', 3, 'isHeld', true), jsonb_build_object('value', 4, 'isHeld', true)
         ))
       )
     )
   WHERE id = v_tie_round_id;
  SELECT private.advance_horses_scc_expired_turn(v_tie_round_id, clock_timestamp()) INTO v_result;
  IF v_result ->> 'status' <> 'settled'
     OR v_result ->> 'terminal_disposition' <> 'session_ended'
     OR (SELECT status FROM public.games WHERE id = v_tie_game_id) <> 'session_ended'
     OR (SELECT pot FROM public.games WHERE id = v_tie_game_id) <> 0 THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:all_absent_session_end_invalid:%', v_result;
  END IF;

  -- SCC uses the same settlement owner, but its server-derived 6-5-4 cargo
  -- evaluation must remain distinct from Horses wild scoring.
  INSERT INTO public.games (id, name, status, game_type, current_game_uuid, current_host, ante_amount, total_hands, current_round, pot, real_money)
  VALUES (v_scc_game_id, 'Codex SCC settlement proof', 'in_progress', 'ship-captain-crew', v_scc_dealer_game_id, v_users[1], 5, 1, 1, 10, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_scc_dealer_game_id, v_scc_game_id, v_users[1], 'ship-captain-crew');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, is_bot, created_at)
  VALUES
    (v_scc_game_id, v_users[1], 1, 95, 'active', false, false, clock_timestamp() - interval '30 seconds'),
    (v_scc_game_id, v_users[2], 2, 95, 'active', false, false, clock_timestamp() - interval '30 seconds');
  SELECT id INTO v_scc_player_one FROM public.players WHERE game_id = v_scc_game_id AND position = 1;
  SELECT id INTO v_scc_player_two FROM public.players WHERE game_id = v_scc_game_id AND position = 2;
  v_state := jsonb_build_object(
    'gamePhase', 'complete', 'turnOrder', jsonb_build_array(v_scc_player_one, v_scc_player_two),
    'playerStates', jsonb_build_object(
      v_scc_player_one::text, jsonb_build_object('isComplete', true, 'dice', jsonb_build_array(
        jsonb_build_object('value', 6, 'isHeld', true, 'isSCC', true, 'sccType', 'ship'), jsonb_build_object('value', 5, 'isHeld', true, 'isSCC', true, 'sccType', 'captain'),
        jsonb_build_object('value', 4, 'isHeld', true, 'isSCC', true, 'sccType', 'crew'), jsonb_build_object('value', 6, 'isHeld', true, 'isSCC', false), jsonb_build_object('value', 6, 'isHeld', true, 'isSCC', false)
      )),
      v_scc_player_two::text, jsonb_build_object('isComplete', true, 'dice', jsonb_build_array(
        jsonb_build_object('value', 3, 'isHeld', true, 'isSCC', false), jsonb_build_object('value', 3, 'isHeld', true, 'isSCC', false), jsonb_build_object('value', 2, 'isHeld', true, 'isSCC', false), jsonb_build_object('value', 2, 'isHeld', true, 'isSCC', false), jsonb_build_object('value', 1, 'isHeld', true, 'isSCC', false)
      ))
    )
  );
  INSERT INTO public.rounds (game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot, horses_state)
  VALUES (v_scc_game_id, v_scc_dealer_game_id, 1, 1, 2, 'betting', 10, v_state)
  RETURNING id INTO v_scc_round_id;
  SELECT public.horses_settle_game(v_scc_game_id, v_scc_round_id, v_scc_dealer_game_id, 1) INTO v_result;
  IF v_result ->> 'status' <> 'settled'
     OR v_result ->> 'terminal_disposition' <> 'session_ended'
     OR (SELECT chips FROM public.players WHERE id = v_scc_player_one) <> 105
     OR (SELECT status FROM public.games WHERE id = v_scc_game_id) <> 'session_ended' THEN
    RAISE EXCEPTION 'horses_scc_disconnect_proof:scc_terminal_settlement_invalid:%', v_result;
  END IF;
END;
$proof$;

ROLLBACK;
