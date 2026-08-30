-- Execute inside BEGIN after the candidate migration and always ROLLBACK.
-- Every game, player, dealer-game, round, and fixture mutation is synthetic.

DO $proof$
DECLARE
  v_admin uuid;
  v_non_admin uuid;
  v_near_game uuid := gen_random_uuid();
  v_max_game uuid := gen_random_uuid();
  v_heels_game uuid := gen_random_uuid();
  v_other_game uuid := gen_random_uuid();
  v_real_game uuid := gen_random_uuid();
  v_terminal_game uuid := gen_random_uuid();
  v_tie_game uuid := gen_random_uuid();
  v_near_dg uuid := gen_random_uuid();
  v_max_dg uuid := gen_random_uuid();
  v_heels_dg uuid := gen_random_uuid();
  v_near_p1 uuid := gen_random_uuid();
  v_near_p2 uuid := gen_random_uuid();
  v_max_p1 uuid := gen_random_uuid();
  v_max_p2 uuid := gen_random_uuid();
  v_heels_p1 uuid := gen_random_uuid();
  v_heels_p2 uuid := gen_random_uuid();
  v_round_id uuid;
  v_state jsonb;
  v_public_state jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_original_harnesses_mode jsonb;
  v_original_global_profile text;
BEGIN
  SELECT role_row.user_id
    INTO v_admin
    FROM public.user_roles role_row
    JOIN auth.users account ON account.id = role_row.user_id
   WHERE role_row.role::text = 'admin'
   ORDER BY account.created_at
   LIMIT 1;
  SELECT account.id
    INTO v_non_admin
    FROM auth.users account
   WHERE account.id <> v_admin
     AND NOT public.has_role(account.id, 'admin')
   ORDER BY account.created_at
   LIMIT 1;
  IF v_admin IS NULL OR v_non_admin IS NULL THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:missing_admin_or_non_admin';
  END IF;

  SELECT setting.value INTO v_original_harnesses_mode
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode';
  SELECT defaults.debug_harness INTO v_original_global_profile
    FROM public.game_defaults defaults WHERE defaults.game_type = 'cribbage';

  INSERT INTO public.games (
    id, name, game_type, status, real_money, ante_amount, buy_in, pot,
    current_round, total_hands, points_to_win, is_first_hand, current_host
  ) VALUES
    (v_near_game, 'Crib rule near proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 121, true, v_admin),
    (v_max_game, 'Crib rule max proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 61, true, v_admin),
    (v_heels_game, 'Crib rule heels proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 2, true, v_admin),
    (v_other_game, 'Crib rule isolation proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 121, true, v_admin),
    (v_real_game, 'Crib rule real-money proof', 'cribbage', 'waiting', true, 1, 100, 0, NULL, 0, 121, true, v_admin),
    (v_terminal_game, 'Crib rule terminal proof', 'cribbage', 'session_ended', false, 1, 100, 0, NULL, 0, 121, true, v_admin),
    (v_tie_game, 'Crib rule tie proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 121, true, v_admin);

  INSERT INTO public.players (id, game_id, user_id, position, chips, is_bot, status)
  VALUES
    (v_near_p1, v_near_game, v_admin, 1, 100, false, 'active'),
    (v_near_p2, v_near_game, v_non_admin, 2, 100, false, 'active'),
    (v_max_p1, v_max_game, v_admin, 1, 100, false, 'active'),
    (v_max_p2, v_max_game, v_non_admin, 2, 100, false, 'active'),
    (v_heels_p1, v_heels_game, v_admin, 1, 100, false, 'active'),
    (v_heels_p2, v_heels_game, v_non_admin, 2, 100, false, 'active'),
    (gen_random_uuid(), v_other_game, v_admin, 1, 100, false, 'active'),
    (gen_random_uuid(), v_other_game, v_non_admin, 2, 100, false, 'active'),
    (gen_random_uuid(), v_real_game, v_admin, 1, 100, false, 'active'),
    (gen_random_uuid(), v_real_game, v_non_admin, 2, 100, false, 'active'),
    (gen_random_uuid(), v_terminal_game, v_admin, 1, 100, false, 'active'),
    (gen_random_uuid(), v_terminal_game, v_non_admin, 2, 100, false, 'active'),
    (gen_random_uuid(), v_tie_game, v_admin, 1, 100, false, 'active'),
    (gen_random_uuid(), v_tie_game, v_non_admin, 2, 100, false, 'active');

  INSERT INTO public.dealer_games (id, dealer_user_id, game_type, session_id, config)
  VALUES
    (v_near_dg, v_admin, 'cribbage', v_near_game, '{}'::jsonb),
    (v_max_dg, v_admin, 'cribbage', v_max_game, '{}'::jsonb),
    (v_heels_dg, v_admin, 'cribbage', v_heels_game, '{}'::jsonb);

  -- Authorization and safety boundaries.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_non_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.arm_cribbage_rule_branch_harness(v_near_game, 'near_double_skunk', 600);
  IF v_result->>'outcome' <> 'not_authorized' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:non_admin_arm_allowed:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.arm_cribbage_rule_branch_harness(v_real_game, 'near_double_skunk', 600);
  IF v_result->>'outcome' <> 'real_money_forbidden' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:real_money_arm_allowed:%', v_result;
  END IF;
  v_result := public.arm_cribbage_rule_branch_harness(v_terminal_game, 'near_double_skunk', 600);
  IF v_result->>'outcome' <> 'wrong_status' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:terminal_arm_allowed:%', v_result;
  END IF;
  v_result := public.arm_cribbage_rule_branch_harness(v_near_game, 'unknown', 600);
  IF v_result->>'outcome' <> 'invalid_profile' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:invalid_profile_allowed:%', v_result;
  END IF;

  -- Exact-game isolation and all three authoritative profiles.
  IF (public.arm_cribbage_rule_branch_harness(v_near_game, 'near_double_skunk', 600)->>'outcome') <> 'armed'
     OR (public.arm_cribbage_rule_branch_harness(v_max_game, 'max_pegging_fan', 600)->>'outcome') <> 'armed'
     OR (public.arm_cribbage_rule_branch_harness(v_heels_game, 'perpetual_heels', 600)->>'outcome') <> 'armed' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:profile_arm_failed';
  END IF;
  IF private.consume_cribbage_rule_branch_harness(v_other_game) IS NOT NULL THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:wrong_game_consumed';
  END IF;
  IF NOT coalesce((public.get_cribbage_rule_branch_harness(v_near_game)->>'armed')::boolean, false) THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:wrong_game_disarmed_request';
  END IF;

  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games
     SET status = 'cribbage_dealer_selection',
         current_game_uuid = CASE id
           WHEN v_near_game THEN v_near_dg
           WHEN v_max_game THEN v_max_dg
           WHEN v_heels_game THEN v_heels_dg
         END,
         dealer_selection_state = jsonb_build_object('isComplete', true, 'winnerPosition', 1)
   WHERE id IN (v_near_game, v_max_game, v_heels_game);

  -- Near-double-skunk seed, private-marker redaction, and start replay.
  v_result := public.start_cribbage_initial_hand(v_near_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:near_start_failed:%', v_result;
  END IF;
  SELECT private_state.state, round_row.cribbage_state
    INTO v_state, v_public_state
    FROM public.rounds round_row
    JOIN private.cribbage_round_states private_state ON private_state.round_id = round_row.id
   WHERE round_row.game_id = v_near_game AND round_row.hand_number = 1;
  IF v_state->>'campaignHarnessProfile' <> 'near_double_skunk'
     OR (v_state#>>ARRAY['playerStates', v_near_p1::text, 'pegScore'])::integer <> 119
     OR (v_state#>>ARRAY['playerStates', v_near_p2::text, 'pegScore'])::integer <> 10 THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:near_seed_wrong:%', v_state;
  END IF;
  IF v_public_state ? 'campaignHarnessProfile' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:private_marker_exposed:%', v_public_state;
  END IF;
  v_replay := public.start_cribbage_initial_hand(v_near_game);
  IF v_replay->>'outcome' <> 'already-started' OR v_replay->>'deduped' <> 'true' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:duplicate_replay_changed_state:%', v_replay;
  END IF;
  IF coalesce((public.get_cribbage_rule_branch_harness(v_near_game)->>'armed')::boolean, false)
     OR public.get_cribbage_rule_branch_harness(v_near_game)->>'consumedAt' IS NULL THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:not_consumed_once';
  END IF;
  v_result := public.arm_cribbage_rule_branch_harness(v_near_game, 'near_double_skunk', 600);
  IF v_result->>'outcome' <> 'wrong_status' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:late_replay_not_rejected:%', v_result;
  END IF;

  -- Continuation into pegging proves the max fan deck and deterministic cut.
  v_result := public.start_cribbage_initial_hand(v_max_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:max_start_failed:%', v_result;
  END IF;
  SELECT round_row.id INTO v_round_id FROM public.rounds round_row
   WHERE round_row.game_id = v_max_game AND round_row.hand_number = 1;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  PERFORM public.cribbage_apply_discard(v_round_id, v_max_p1, ARRAY[0,1]);
  PERFORM public.cribbage_apply_discard(v_round_id, v_max_p2, ARRAY[0,1]);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = v_round_id;
  IF v_state->>'phase' <> 'pegging'
     OR v_state#>>'{cutCard,rank}' <> '4'
     OR v_state#>>'{cutCard,suit}' <> 'spades'
     OR jsonb_array_length(v_state->'crib') <> 4 THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:continuation_failed:%', v_state;
  END IF;

  -- Winner/terminal: deterministic His Heels reaches target two immediately.
  v_result := public.start_cribbage_initial_hand(v_heels_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:heels_start_failed:%', v_result;
  END IF;
  SELECT round_row.id INTO v_round_id FROM public.rounds round_row
   WHERE round_row.game_id = v_heels_game AND round_row.hand_number = 1;
  PERFORM public.cribbage_apply_discard(v_round_id, v_heels_p1, ARRAY[0,1]);
  PERFORM public.cribbage_apply_discard(v_round_id, v_heels_p2, ARRAY[0,1]);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = v_round_id;
  IF v_state->>'phase' <> 'complete'
     OR v_state#>>'{cutCard,rank}' <> 'J'
     OR v_state#>>'{lastEvent,type}' <> 'his_heels'
     OR v_state->>'winnerPlayerId' <> v_heels_p1::text
     OR v_state->>'matchCompleteLatch' <> 'true' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:winner_terminal_wrong:%', v_state;
  END IF;

  -- Tie: the existing exact-game dealer-draw fixture still produces a legal
  -- tie wave and one winner while this migration is installed.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.arm_cribbage_dealer_draw_tie_harness(v_tie_game, 600);
  IF v_result->>'outcome' <> 'armed' THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:tie_arm_failed:%', v_result;
  END IF;
  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games SET status = 'cribbage_dealer_selection' WHERE id = v_tie_game;
  v_state := public.cribbage_prepare_dealer_selection(v_tie_game);
  IF v_state->>'harnessApplied' <> 'force_first_round_tie_once'
     OR jsonb_array_length(v_state->'cards') <> 4
     OR (v_state->>'winnerPosition')::integer <> 1 THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:tie_or_winner_wrong:%', v_state;
  END IF;

  -- The exact fixture never mutates either global harness owner.
  IF (SELECT setting.value FROM public.system_settings setting WHERE setting.key = 'harnesses_mode')
       IS DISTINCT FROM v_original_harnesses_mode THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:global_harness_gate_mutated';
  END IF;
  IF (SELECT defaults.debug_harness FROM public.game_defaults defaults WHERE defaults.game_type = 'cribbage')
       IS DISTINCT FROM v_original_global_profile THEN
    RAISE EXCEPTION 'cribbage_rule_fixture_proof:global_profile_mutated';
  END IF;
END;
$proof$;
