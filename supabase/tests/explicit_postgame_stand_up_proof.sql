-- Rollback-only proof for atomic Stand Up plus post-game lifecycle resolution.
-- Requires three profiles as FK parents; it writes no persistent rows.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_usernames text[];
  v_unauthorized uuid := gen_random_uuid();
  v_auth_game_id uuid := gen_random_uuid();
  v_auth_player_id uuid := gen_random_uuid();
  v_fake_game_id uuid := gen_random_uuid();
  v_fake_dealer_game_id uuid := gen_random_uuid();
  v_fake_player_one_id uuid := gen_random_uuid();
  v_fake_player_two_id uuid := gen_random_uuid();
  v_fake_bot_id uuid := gen_random_uuid();
  v_real_game_id uuid := gen_random_uuid();
  v_real_dealer_game_id uuid := gen_random_uuid();
  v_real_player_one_id uuid := gen_random_uuid();
  v_real_player_two_id uuid := gen_random_uuid();
  v_waiting_game_id uuid := gen_random_uuid();
  v_waiting_dealer_game_id uuid := gen_random_uuid();
  v_waiting_player_one_id uuid := gen_random_uuid();
  v_waiting_player_two_id uuid := gen_random_uuid();
  v_continue_game_id uuid := gen_random_uuid();
  v_continue_dealer_game_id uuid := gen_random_uuid();
  v_continue_player_one_id uuid := gen_random_uuid();
  v_continue_player_two_id uuid := gen_random_uuid();
  v_continue_player_three_id uuid := gen_random_uuid();
  v_initial_game_id uuid := gen_random_uuid();
  v_initial_player_one_id uuid := gen_random_uuid();
  v_initial_player_two_id uuid := gen_random_uuid();
  v_live_game_id uuid := gen_random_uuid();
  v_live_dealer_game_id uuid := gen_random_uuid();
  v_live_player_one_id uuid := gen_random_uuid();
  v_live_player_two_id uuid := gen_random_uuid();
  v_result jsonb;
  v_count integer;
  v_sum integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id),
         array_agg(username ORDER BY created_at, id)
    INTO v_users, v_usernames
    FROM (
      SELECT id, username, created_at
        FROM public.profiles
       ORDER BY created_at, id
       LIMIT 3
    ) available_users;

  IF COALESCE(cardinality(v_users), 0) < 3 THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:requires_three_profiles';
  END IF;

  IF has_function_privilege(
       'anon', 'public.stand_up_and_resolve_postgame(uuid)', 'EXECUTE'
     )
     OR has_function_privilege(
       'service_role', 'public.stand_up_and_resolve_postgame(uuid)', 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated', 'public.stand_up_and_resolve_postgame(uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:authorization-shape';
  END IF;

  -- A caller without a participant row cannot mutate another session.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_auth_game_id, 'Codex rollback proof - stand-up auth',
    'waiting', v_users[1], 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES (
    v_auth_player_id, v_auth_game_id, v_users[1], 1, 0,
    'active', false, false
  );

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized, 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_auth_game_id);
  IF v_result->>'outcome' <> 'not-authorized'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_auth_player_id
          AND (status = 'left' OR sitting_out = true)
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:unauthorized:%', v_result;
  END IF;

  -- A seated voluntary sitter keeps the session alive when the other human
  -- stands. Only the last seated human standing ends the fake-money session.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_fake_game_id, 'Codex rollback proof - fake zero humans',
    'game_selection', v_users[1], 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_fake_player_one_id, v_fake_game_id, v_users[1], 3, 0, 'active', true, false),
    (v_fake_player_two_id, v_fake_game_id, v_users[2], 7, 0, 'active', false, false),
    (v_fake_bot_id, v_fake_game_id, v_users[3], 5, 0, 'active', false, true);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_fake_dealer_game_id, v_fake_game_id, v_users[1], 'holm');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_fake_game_id, v_fake_dealer_game_id, 'holm', 1, 0,
    v_fake_player_two_id, v_usernames[2],
    jsonb_build_object(
      v_fake_player_one_id::text, 0,
      v_fake_player_two_id::text, 0
    )
  );
  PERFORM private.resolve_postgame_participation(v_fake_game_id);

  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_fake_game_id);
  IF v_result->>'outcome' <> 'waiting-insufficient-eligible-participants'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT TRUE
     OR (v_result->>'active_humans')::integer <> 0
     OR (v_result->>'seated_humans')::integer <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_fake_player_two_id
          AND status = 'left'
          AND sitting_out = true
          AND stand_up_next_hand = false
          AND sit_out_next_hand = false
          AND waiting = false
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.games
         WHERE id = v_fake_game_id
          AND status = 'waiting'
     )
     OR NOT EXISTS (
       SELECT 1 FROM private.session_abandonment_watches
        WHERE game_id = v_fake_game_id
          AND waiting_kind = 'subsequent'
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:fake-seat-retained:%', v_result;
  END IF;
  SELECT count(*) INTO v_count
    FROM public.player_transactions
   WHERE source_game_id = v_fake_game_id
     AND transaction_type = 'SessionResult';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:fake-financials:%', v_count;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_fake_game_id);
  IF v_result->>'outcome' <> 'session-ended-without-financial-settlement'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_fake_game_id
          AND status = 'session_ended'
          AND session_ended_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:fake-terminal:%', v_result;
  END IF;

  v_result := public.stand_up_and_resolve_postgame(v_fake_game_id);
  SELECT count(*) INTO v_count
    FROM public.player_transactions
   WHERE source_game_id = v_fake_game_id
     AND transaction_type = 'SessionResult';
  IF v_result->>'outcome' <> 'already-session-ended' OR v_count <> 0 THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:fake-replay:%:%',
      v_result, v_count;
  END IF;

  -- Real-money zero-human closure reuses the snapshot-backed finalizer and
  -- remains exactly-once under immediate and late replay.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_real_game_id, 'Codex rollback proof - real zero humans',
    'game_selection', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_real_player_one_id, v_real_game_id, v_users[1], 3, -3, 'folded', true, false),
    (v_real_player_two_id, v_real_game_id, v_users[2], 7, 3, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_real_dealer_game_id, v_real_game_id, v_users[1], 'three-five-seven');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_real_game_id, v_real_dealer_game_id, 'three-five-seven', 1, 6,
    v_real_player_two_id, v_usernames[2],
    jsonb_build_object(
      v_real_player_one_id::text, -3,
      v_real_player_two_id::text, 3
    )
  );
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id,
    user_id, username, chips, is_bot
  ) VALUES
    (v_real_game_id, v_real_dealer_game_id, 1, v_real_player_one_id,
     v_users[1], v_usernames[1], -3, false),
    (v_real_game_id, v_real_dealer_game_id, 1, v_real_player_two_id,
     v_users[2], v_usernames[2], 3, false);

  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_real_game_id);
  SELECT count(*), COALESCE(sum(amount), 0)
    INTO v_count, v_sum
    FROM public.player_transactions
   WHERE source_game_id = v_real_game_id
     AND transaction_type = 'SessionResult';
  IF v_result->>'outcome' <> 'waiting-insufficient-eligible-participants'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT TRUE
     OR (v_result->>'seated_humans')::integer <> 1
     OR v_count <> 0
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_real_game_id AND status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:real-seat-retained:%:%,%',
      v_result, v_count, v_sum;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_real_game_id);
  SELECT count(*), COALESCE(sum(amount), 0)
    INTO v_count, v_sum
    FROM public.player_transactions
   WHERE source_game_id = v_real_game_id
     AND transaction_type = 'SessionResult';
  IF v_result->>'outcome' <> 'session-ended-with-results'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_real_game_id AND status = 'session_ended'
     )
     OR v_count <> 2
     OR v_sum <> 0 THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:real-terminal:%:%,%',
      v_result, v_count, v_sum;
  END IF;

  v_result := public.stand_up_and_resolve_postgame(v_real_game_id);
  SELECT count(*) INTO v_count
    FROM public.player_transactions
   WHERE source_game_id = v_real_game_id
     AND transaction_type = 'SessionResult';
  IF v_result->>'outcome' <> 'already-session-ended' OR v_count <> 2 THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:real-replay:%:%',
      v_result, v_count;
  END IF;

  -- One active human is a Waiting-table disposition, not Session Ended. All
  -- setup identity is cleared and only that still-active human keeps a watch.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money,
    config_complete, config_deadline
  ) VALUES (
    v_waiting_game_id, 'Codex rollback proof - one active human',
    'configuring', v_users[1], 1, 0, false,
    true, clock_timestamp() + interval '1 minute'
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_waiting_player_one_id, v_waiting_game_id, v_users[1], 3, 0, 'active', false, false),
    (v_waiting_player_two_id, v_waiting_game_id, v_users[2], 7, 0, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_waiting_dealer_game_id, v_waiting_game_id, v_users[1], 'holm');
  UPDATE public.games
     SET current_game_uuid = v_waiting_dealer_game_id
   WHERE id = v_waiting_game_id;
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_waiting_game_id, v_waiting_dealer_game_id, 'holm', 1, 0,
    v_waiting_player_one_id, v_usernames[1],
    jsonb_build_object(
      v_waiting_player_one_id::text, 0,
      v_waiting_player_two_id::text, 0
    )
  );

  v_result := public.stand_up_and_resolve_postgame(v_waiting_game_id);
  IF v_result->>'outcome' <> 'waiting-insufficient-eligible-participants'
     OR (v_result->>'active_humans')::integer <> 1
     OR (v_result->>'active_players')::integer <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_waiting_game_id
          AND status = 'waiting'
          AND current_game_uuid IS NULL
          AND config_complete = false
          AND config_deadline IS NULL
     )
     OR NOT EXISTS (
       SELECT 1 FROM private.session_abandonment_watches
        WHERE game_id = v_waiting_game_id
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:waiting:%', v_result;
  END IF;

  -- Two eligible humans remain: preserve the setup phase exactly as-is.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money,
    config_complete
  ) VALUES (
    v_continue_game_id, 'Codex rollback proof - eligible continuation',
    'game_selection', v_users[1], 1, 0, false, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_continue_player_one_id, v_continue_game_id, v_users[1], 1, 0, 'active', false, false),
    (v_continue_player_two_id, v_continue_game_id, v_users[2], 4, 0, 'active', false, false),
    (v_continue_player_three_id, v_continue_game_id, v_users[3], 7, 0, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_continue_dealer_game_id, v_continue_game_id, v_users[1], 'holm');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_continue_game_id, v_continue_dealer_game_id, 'holm', 1, 0,
    v_continue_player_one_id, v_usernames[1],
    jsonb_build_object(
      v_continue_player_one_id::text, 0,
      v_continue_player_two_id::text, 0,
      v_continue_player_three_id::text, 0
    )
  );

  PERFORM set_config('request.jwt.claim.sub', v_users[3]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[3], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_continue_game_id);
  IF v_result->>'outcome' <> 'eligible-participants-remain'
     OR (v_result->>'active_humans')::integer <> 2
     OR (v_result->>'active_players')::integer <> 2
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_continue_game_id
          AND status = 'game_selection'
          AND config_complete = true
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:continuation:%', v_result;
  END IF;

  -- Initial Waiting remains outside post-game resolution while a seat remains,
  -- but the last voluntary stand-up deletes the pristine session atomically.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_initial_game_id, 'Codex rollback proof - initial waiting',
    'waiting', v_users[1], 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_initial_player_one_id, v_initial_game_id, v_users[1], 3, 0, 'active', false, false),
    (v_initial_player_two_id, v_initial_game_id, v_users[2], 7, 0, 'active', false, false);

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_initial_game_id);
  IF v_result->>'outcome' <> 'stand-up-recorded-outside-postgame'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT FALSE
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_initial_game_id
          AND status = 'waiting'
          AND current_host = v_users[2]
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:initial-waiting:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'authenticated')::text,
    true
  );
  v_result := public.stand_up_and_resolve_postgame(v_initial_game_id);
  IF v_result->>'outcome' <> 'deleted-pristine-initial-session'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT TRUE
     OR EXISTS (
       SELECT 1 FROM public.games WHERE id = v_initial_game_id
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:initial-delete:%', v_result;
  END IF;

  -- A live dealer game remains outside this lifecycle owner.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_live_game_id, 'Codex rollback proof - live dealer game',
    'in_progress', v_users[1], 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_live_player_one_id, v_live_game_id, v_users[1], 3, 0, 'active', true, false),
    (v_live_player_two_id, v_live_game_id, v_users[2], 7, 0, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_live_dealer_game_id, v_live_game_id, v_users[1], 'holm');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_live_game_id, v_live_dealer_game_id, 'holm', 1, 0,
    v_live_player_two_id, v_usernames[2],
    jsonb_build_object(
      v_live_player_one_id::text, 0,
      v_live_player_two_id::text, 0
    )
  );

  v_result := public.stand_up_and_resolve_postgame(v_live_game_id);
  IF v_result->>'outcome' <> 'stand-up-recorded-outside-postgame'
     OR (v_result->>'lifecycle_resolved')::boolean IS NOT FALSE
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_live_game_id AND status = 'in_progress'
     ) THEN
    RAISE EXCEPTION 'explicit_postgame_stand_up_proof:live-game:%', v_result;
  END IF;

  RAISE NOTICE 'explicit_postgame_stand_up_proof:passed';
END;
$proof$;

ROLLBACK;
