-- Complete rollback-only proof for Holm's exact postgame authority.
-- Covers winner, chopped/tie, duplicate, replay, late replay,
-- authorization, continuation, canonical-timer recovery, unsettled admission,
-- and already-terminal state. This file owns its BEGIN/ROLLBACK boundary.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid := gen_random_uuid();

  v_game uuid := gen_random_uuid();
  v_dealer_game uuid := gen_random_uuid();
  v_new_dealer_game uuid := gen_random_uuid();
  v_round uuid := gen_random_uuid();
  v_winner uuid;
  v_other uuid;

  v_tie_game uuid := gen_random_uuid();
  v_tie_dealer_game uuid := gen_random_uuid();
  v_tie_round uuid := gen_random_uuid();
  v_tie_winner uuid;
  v_tie_other uuid;

  v_terminal_game uuid := gen_random_uuid();
  v_terminal_dealer_game uuid := gen_random_uuid();
  v_terminal_round uuid := gen_random_uuid();
  v_terminal_winner uuid;
  v_terminal_other uuid;

  v_unsettled_game uuid := gen_random_uuid();
  v_unsettled_dealer_game uuid := gen_random_uuid();
  v_unsettled_round uuid := gen_random_uuid();

  v_result jsonb;
  v_replay jsonb;
  v_before_winner_chips integer;
  v_after_winner_chips integer;
  v_error_message text;
  v_rejected boolean := false;
  v_definition text;
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
    RAISE EXCEPTION 'holm_postgame_proof:requires_two_profiles';
  END IF;

  IF to_regprocedure(
       'public.holm_advance_postgame(uuid,uuid,uuid,integer)'
     ) IS NULL THEN
    RAISE EXCEPTION 'holm_postgame_proof:public_wrapper_missing';
  END IF;
  IF has_function_privilege(
       'anon',
       'public.holm_advance_postgame(uuid,uuid,uuid,integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'public',
       'public.holm_advance_postgame(uuid,uuid,uuid,integer)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.holm_advance_postgame(uuid,uuid,uuid,integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:wrapper_grants_invalid';
  END IF;

  SELECT pg_get_functiondef(
           'private.advance_standard_postgame(uuid,uuid,integer)'::regprocedure
         )
    INTO v_definition;
  IF position('holm_settlement_not_committed' IN v_definition) = 0
     OR position('chucky_final_award' IN v_definition) = 0
     OR position('FOR UPDATE' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'holm_postgame_proof:private_owner_not_hardened';
  END IF;

  UPDATE public.system_settings
     SET value = jsonb_build_object('enabled', false)
   WHERE key = 'make_it_take_it';

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[1])::text,
    true
  );

  -- Winner/continuation fixture. Use the installed Holm settlement RPC so
  -- postgame proves the exact financial result it consumes.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, total_hands, current_round,
    game_setup_timer_seconds
  ) VALUES (
    v_game, 'Codex rollback proof - Holm postgame winner',
    'in_progress', 'holm-game', v_dealer_game, v_users[1],
    1, false, 1, 10, false, false, 1, 1, 30
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_dealer_game, v_game, v_users[1], 'holm'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES
    (v_game, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  SELECT id INTO v_winner
    FROM public.players WHERE game_id = v_game AND position = 1;
  SELECT id INTO v_other
    FROM public.players WHERE game_id = v_game AND position = 2;
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id
  ) VALUES (
    v_round, v_game, 1, 52, 'showdown', 10, 1, v_dealer_game
  );

  SELECT public.holm_settle_hand(
    v_game,
    v_dealer_game,
    1,
    'chucky_final_award'::public.holm_event_kind,
    0,
    false,
    'Winner beat Chucky',
    jsonb_build_object(v_winner::text, 10, v_other::text, 0),
    'Proof winner',
    v_winner,
    'Proof winner',
    false,
    10,
    true,
    0,
    true,
    true
  ) INTO v_result;
  IF v_result->>'status' <> 'settled'
     OR v_result->>'terminal_disposition' <> 'game_over'
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'game_over'
     OR (SELECT status FROM public.rounds WHERE id = v_round) <> 'completed' THEN
    RAISE EXCEPTION 'holm_postgame_proof:winner_settlement_failed:%', v_result;
  END IF;

  SELECT chips INTO v_before_winner_chips
    FROM public.players WHERE id = v_winner;

  -- Authorization failure must not create a claim or mutate the lifecycle.
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_outsider)::text,
    true
  );
  v_rejected := false;
  BEGIN
    PERFORM public.holm_advance_postgame(
      v_game, v_round, v_dealer_game, 1
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_message := SQLERRM;
    IF v_error_message LIKE '%holm_advance_postgame:not_in_session%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'game_over'
     OR EXISTS (
       SELECT 1 FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_game
     ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:authorization_failed';
  END IF;

  -- Any connected participant may submit presentation completion. The exact
  -- private claim admits one transition and does no additional chip movement.
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[1])::text,
    true
  );
  SELECT public.holm_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_result;
  SELECT chips INTO v_after_winner_chips
    FROM public.players WHERE id = v_winner;
  IF v_result->>'outcome' <> 'advanced'
     OR v_result->>'status' <> 'game_selection'
     OR (v_result->>'dealer_position')::integer <> 2
     OR v_after_winner_chips <> v_before_winner_chips
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'game_selection'
     OR (SELECT current_game_uuid FROM public.games WHERE id = v_game) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id = v_game) <> 0 THEN
    RAISE EXCEPTION 'holm_postgame_proof:winner_continuation_failed:%', v_result;
  END IF;

  SELECT public.holm_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_advanced'
     OR coalesce((v_replay->>'deduped')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'holm_postgame_proof:duplicate_failed:%', v_replay;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[2])::text,
    true
  );
  SELECT public.holm_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_advanced' THEN
    RAISE EXCEPTION 'holm_postgame_proof:peer_replay_failed:%', v_replay;
  END IF;

  -- A late replay can read its old claim but cannot clear a newer dealer game.
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_new_dealer_game, v_game, v_users[2], 'gin-rummy'
  );
  UPDATE public.games
     SET status = 'ante_decision',
         game_type = 'gin-rummy',
         current_game_uuid = v_new_dealer_game,
         total_hands = 0
   WHERE id = v_game;
  SELECT public.holm_advance_postgame(
    v_game, v_round, v_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_advanced'
     OR (SELECT current_game_uuid FROM public.games WHERE id = v_game)
          IS DISTINCT FROM v_new_dealer_game
     OR (SELECT status FROM public.games WHERE id = v_game) <> 'ante_decision' THEN
    RAISE EXCEPTION 'holm_postgame_proof:late_replay_crossed_boundary:%', v_replay;
  END IF;

  -- Chopped/tie settlement plus disconnected-client recovery. A queued Sit
  -- Out is consumed by the same owner before the cohort is derived, so the
  -- canonical timer returns the one-player session to Waiting.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, total_hands, current_round,
    game_setup_timer_seconds
  ) VALUES (
    v_tie_game, 'Codex rollback proof - Holm postgame chopped',
    'in_progress', 'holm-game', v_tie_dealer_game, v_users[1],
    1, false, 1, 10, false, false, 1, 1, 30
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_tie_dealer_game, v_tie_game, v_users[1], 'holm'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot, sit_out_next_hand
  ) VALUES
    (v_tie_game, v_users[1], 1, 100, 'active', false, 'ante_up', false, false),
    (v_tie_game, v_users[2], 2, 100, 'active', false, 'ante_up', false, true);
  SELECT id INTO v_tie_winner
    FROM public.players WHERE game_id = v_tie_game AND position = 1;
  SELECT id INTO v_tie_other
    FROM public.players WHERE game_id = v_tie_game AND position = 2;
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id
  ) VALUES (
    v_tie_round, v_tie_game, 1, 52, 'showdown', 10, 1, v_tie_dealer_game
  );
  SELECT public.holm_settle_hand(
    v_tie_game,
    v_tie_dealer_game,
    1,
    'chucky_final_award'::public.holm_event_kind,
    0,
    false,
    'Tied players beat Chucky',
    jsonb_build_object(v_tie_winner::text, 5, v_tie_other::text, 5),
    'Proof chopped result',
    v_tie_winner,
    'Proof chopped winners',
    true,
    10,
    true,
    0,
    true,
    true
  ) INTO v_result;
  IF v_result->>'status' <> 'settled'
     OR NOT EXISTS (
       SELECT 1
         FROM public.game_results result
        WHERE result.game_id = v_tie_game
          AND result.dealer_game_id = v_tie_dealer_game
          AND result.hand_number = 1
          AND result.event_kind = 'chucky_final_award'
          AND result.is_chopped
     ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:tie_settlement_failed:%', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id = timer.game_id
      JOIN public.game_defaults defaults ON defaults.game_type = 'holm'
     WHERE timer.game_id = v_tie_game
       AND timer.timer_kind = 'standard_postgame'
       AND timer.state = 'scheduled'
       AND timer.due_at = game_row.game_over_at
         + make_interval(
             secs => defaults.holm_presentation_ack_fallback_seconds
           )
       AND (timer.metadata->>'fallback_seconds')::integer
         = defaults.holm_presentation_ack_fallback_seconds
  ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:fallback_default_not_registered';
  END IF;

  UPDATE private.game_timer_registry
     SET due_at = '2000-01-01 00:00:00+00'::timestamptz
   WHERE game_id = v_tie_game
     AND timer_kind = 'standard_postgame'
     AND state = 'scheduled';
  PERFORM private.advance_due_canonical_game_timers(1);
  IF (SELECT status FROM public.games WHERE id = v_tie_game) <> 'waiting'
     OR NOT coalesce((
       SELECT sitting_out FROM public.players WHERE id = v_tie_other
     ), false)
     OR coalesce((
       SELECT sit_out_next_hand FROM public.players WHERE id = v_tie_other
     ), false)
     OR NOT EXISTS (
       SELECT 1
         FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_tie_game
          AND claim.dealer_game_id = v_tie_dealer_game
          AND claim.hand_number = 1
          AND claim.target_status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:timer_recovery_failed';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[1])::text,
    true
  );
  SELECT public.holm_advance_postgame(
    v_tie_game, v_tie_round, v_tie_dealer_game, 1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already_advanced' THEN
    RAISE EXCEPTION 'holm_postgame_proof:timer_then_client_replay_failed:%', v_replay;
  END IF;

  -- Settlement admission: game_over plus a completed Holm round is not enough.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, pot, real_money, total_hands, current_round
  ) VALUES (
    v_unsettled_game, 'Codex rollback proof - Holm unsettled reject',
    'game_over', 'holm-game', v_unsettled_dealer_game, v_users[1],
    1, 0, false, 1, 1
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_unsettled_dealer_game, v_unsettled_game, v_users[1], 'holm'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_unsettled_game, v_users[1], 1, 100, 'active', false, false),
    (v_unsettled_game, v_users[2], 2, 100, 'active', false, false);
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id
  ) VALUES (
    v_unsettled_round, v_unsettled_game, 1, 52, 'completed', 0,
    1, v_unsettled_dealer_game
  );
  v_rejected := false;
  BEGIN
    PERFORM public.holm_advance_postgame(
      v_unsettled_game,
      v_unsettled_round,
      v_unsettled_dealer_game,
      1
    );
  EXCEPTION WHEN OTHERS THEN
    v_error_message := SQLERRM;
    IF v_error_message LIKE '%holm_settlement_not_committed:0%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected
     OR (SELECT status FROM public.games WHERE id = v_unsettled_game)
          <> 'game_over'
     OR EXISTS (
       SELECT 1 FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_unsettled_game
     ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:unsettled_boundary_mutated';
  END IF;

  -- LAST HAND settlement already owns Session Ended. A presentation replay is
  -- stale and must not create a postgame claim or reopen the session.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, total_hands, current_round,
    pending_session_end
  ) VALUES (
    v_terminal_game, 'Codex rollback proof - Holm already terminal',
    'in_progress', 'holm-game', v_terminal_dealer_game, v_users[1],
    1, false, 1, 10, false, false, 1, 1, true
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_terminal_dealer_game, v_terminal_game, v_users[1], 'holm'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES
    (v_terminal_game, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_terminal_game, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  SELECT id INTO v_terminal_winner
    FROM public.players WHERE game_id = v_terminal_game AND position = 1;
  SELECT id INTO v_terminal_other
    FROM public.players WHERE game_id = v_terminal_game AND position = 2;
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id
  ) VALUES (
    v_terminal_round, v_terminal_game, 1, 52, 'showdown', 10,
    1, v_terminal_dealer_game
  );
  SELECT public.holm_settle_hand(
    v_terminal_game,
    v_terminal_dealer_game,
    1,
    'chucky_final_award'::public.holm_event_kind,
    0,
    false,
    'LAST HAND winner beat Chucky',
    jsonb_build_object(v_terminal_winner::text, 10, v_terminal_other::text, 0),
    'Proof terminal winner',
    v_terminal_winner,
    'Proof terminal winner',
    false,
    10,
    true,
    0,
    true,
    true
  ) INTO v_result;
  IF v_result->>'terminal_disposition' <> 'session_ended'
     OR (SELECT status FROM public.games WHERE id = v_terminal_game)
          <> 'session_ended' THEN
    RAISE EXCEPTION 'holm_postgame_proof:terminal_settlement_failed:%', v_result;
  END IF;
  SELECT public.holm_advance_postgame(
    v_terminal_game,
    v_terminal_round,
    v_terminal_dealer_game,
    1
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'stale_identity'
     OR (SELECT status FROM public.games WHERE id = v_terminal_game)
          <> 'session_ended'
     OR EXISTS (
       SELECT 1 FROM private.standard_postgame_advances claim
        WHERE claim.game_id = v_terminal_game
     ) THEN
    RAISE EXCEPTION 'holm_postgame_proof:terminal_replay_mutated:%', v_replay;
  END IF;

  RAISE NOTICE 'holm_postgame_authority_rollback_proof:passed';
END;
$proof$;

ROLLBACK;
