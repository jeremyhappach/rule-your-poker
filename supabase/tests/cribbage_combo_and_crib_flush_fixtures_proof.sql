-- Execute inside BEGIN after the candidate migration and always ROLLBACK.
-- Every game, player, dealer-game, round, and fixture mutation is synthetic.

DO $proof$
DECLARE
  v_admin uuid;
  v_non_admin uuid;
  v_combo_game uuid := gen_random_uuid();
  v_qualifying_game uuid := gen_random_uuid();
  v_nonqualifying_game uuid := gen_random_uuid();
  v_combo_dg uuid := gen_random_uuid();
  v_qualifying_dg uuid := gen_random_uuid();
  v_nonqualifying_dg uuid := gen_random_uuid();
  v_combo_p1 uuid := gen_random_uuid();
  v_combo_p2 uuid := gen_random_uuid();
  v_qualifying_p1 uuid := gen_random_uuid();
  v_qualifying_p2 uuid := gen_random_uuid();
  v_nonqualifying_p1 uuid := gen_random_uuid();
  v_nonqualifying_p2 uuid := gen_random_uuid();
  v_combo_round uuid;
  v_qualifying_round uuid;
  v_nonqualifying_round uuid;
  v_non_dealer uuid;
  v_dealer uuid;
  v_state jsonb;
  v_result jsonb;
  v_ranks jsonb;
  v_combo_points jsonb;
  v_totals jsonb;
  v_crib_score jsonb;
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
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:missing_admin_or_non_admin';
  END IF;

  INSERT INTO public.games (
    id, name, game_type, status, real_money, ante_amount, buy_in, pot,
    current_round, total_hands, points_to_win, is_first_hand, current_host
  ) VALUES
    (v_combo_game, 'Crib combo fixture proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 61, true, v_admin),
    (v_qualifying_game, 'Crib flush five proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 61, true, v_admin),
    (v_nonqualifying_game, 'Crib flush four proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 61, true, v_admin);

  INSERT INTO public.players (id, game_id, user_id, position, chips, is_bot, status)
  VALUES
    (v_combo_p1, v_combo_game, v_admin, 1, 100, false, 'active'),
    (v_combo_p2, v_combo_game, v_non_admin, 2, 100, false, 'active'),
    (v_qualifying_p1, v_qualifying_game, v_admin, 1, 100, false, 'active'),
    (v_qualifying_p2, v_qualifying_game, v_non_admin, 2, 100, false, 'active'),
    (v_nonqualifying_p1, v_nonqualifying_game, v_admin, 1, 100, false, 'active'),
    (v_nonqualifying_p2, v_nonqualifying_game, v_non_admin, 2, 100, false, 'active');

  INSERT INTO public.dealer_games (id, dealer_user_id, game_type, session_id, config)
  VALUES
    (v_combo_dg, v_admin, 'cribbage', v_combo_game, '{}'::jsonb),
    (v_qualifying_dg, v_admin, 'cribbage', v_qualifying_game, '{}'::jsonb),
    (v_nonqualifying_dg, v_admin, 'cribbage', v_nonqualifying_game, '{}'::jsonb);

  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin, 'role', 'authenticated'
  )::text, true);
  IF (public.arm_cribbage_rule_branch_harness(v_combo_game, 'fifteen_run_go_counting', 600)->>'outcome') <> 'armed'
     OR (public.arm_cribbage_rule_branch_harness(v_qualifying_game, 'crib_flush_qualifying', 600)->>'outcome') <> 'armed'
     OR (public.arm_cribbage_rule_branch_harness(v_nonqualifying_game, 'crib_flush_nonqualifying', 600)->>'outcome') <> 'armed' THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:new_profile_arm_failed';
  END IF;

  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games
     SET status = 'cribbage_dealer_selection',
         current_game_uuid = CASE id
           WHEN v_combo_game THEN v_combo_dg
           WHEN v_qualifying_game THEN v_qualifying_dg
           WHEN v_nonqualifying_game THEN v_nonqualifying_dg
         END,
         dealer_selection_state = jsonb_build_object('isComplete', true, 'winnerPosition', 1)
   WHERE id IN (v_combo_game, v_qualifying_game, v_nonqualifying_game);

  v_result := public.start_cribbage_initial_hand(v_combo_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:combo_start_failed:%', v_result;
  END IF;
  v_result := public.start_cribbage_initial_hand(v_qualifying_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:qualifying_start_failed:%', v_result;
  END IF;
  v_result := public.start_cribbage_initial_hand(v_nonqualifying_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:nonqualifying_start_failed:%', v_result;
  END IF;

  SELECT round_row.id INTO v_combo_round FROM public.rounds round_row
   WHERE round_row.game_id = v_combo_game AND round_row.hand_number = 1;
  SELECT round_row.id INTO v_qualifying_round FROM public.rounds round_row
   WHERE round_row.game_id = v_qualifying_game AND round_row.hand_number = 1;
  SELECT round_row.id INTO v_nonqualifying_round FROM public.rounds round_row
   WHERE round_row.game_id = v_nonqualifying_game AND round_row.hand_number = 1;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  PERFORM public.cribbage_apply_discard(v_combo_round, v_combo_p1, ARRAY[0,1]);
  PERFORM public.cribbage_apply_discard(v_combo_round, v_combo_p2, ARRAY[0,1]);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = v_combo_round;
  v_dealer := (v_state->>'dealerPlayerId')::uuid;
  v_non_dealer := (v_state#>>'{turnOrder,0}')::uuid;
  IF v_dealer = v_non_dealer
     OR v_state#>>'{cutCard,rank}' <> '4'
     OR v_state#>>'{cutCard,suit}' <> 'hearts'
     OR jsonb_array_length(v_state->'crib') <> 4 THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:combo_opening_wrong:%', v_state;
  END IF;
  SELECT jsonb_agg(card.value->>'rank' ORDER BY card.ordinality)
    INTO v_ranks
    FROM jsonb_array_elements(v_state#>ARRAY['playerStates',v_non_dealer::text,'hand'])
      WITH ORDINALITY card(value, ordinality);
  IF v_ranks <> '["5","6","9","7"]'::jsonb THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:nondealer_hand_wrong:%', v_ranks;
  END IF;
  SELECT jsonb_agg(card.value->>'rank' ORDER BY card.ordinality)
    INTO v_ranks
    FROM jsonb_array_elements(v_state#>ARRAY['playerStates',v_dealer::text,'hand'])
      WITH ORDINALITY card(value, ordinality);
  IF v_ranks <> '["10","10","8","J"]'::jsonb THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:dealer_hand_wrong:%', v_ranks;
  END IF;

  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_non_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_non_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_non_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_non_dealer, 'play', 0, NULL);
  PERFORM public.cribbage_apply_pegging_action(v_combo_round, v_dealer, 'play', 0, NULL);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = v_combo_round;

  SELECT jsonb_agg(play.value->'card'->>'rank' ORDER BY play.ordinality)
    INTO v_ranks
    FROM jsonb_array_elements(v_state#>'{pegging,playedCards}')
      WITH ORDINALITY play(value, ordinality);
  IF v_state->>'phase' <> 'counting'
     OR v_ranks <> '["5","10","6","10","9","8","7","J"]'::jsonb
     OR (v_state#>>ARRAY['countingPlan','baselineScores',v_non_dealer::text])::integer <> 4
     OR (v_state#>>ARRAY['countingPlan','baselineScores',v_dealer::text])::integer <> 5
     OR v_state#>>'{lastEvent,label}' <> 'Last Card'
     OR (v_state#>>'{lastEvent,points}')::integer <> 1
     OR (v_state#>>'{lastEvent,count}')::integer <> 10 THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:pegging_15_31_run_go_reset_wrong:%', v_state;
  END IF;

  SELECT jsonb_agg(target.value->'comboPoints' ORDER BY target.ordinality),
         jsonb_agg((target.value->>'totalPoints')::integer ORDER BY target.ordinality)
    INTO v_combo_points, v_totals
    FROM jsonb_array_elements(v_state#>'{countingPlan,targets}')
      WITH ORDINALITY target(value, ordinality);
  IF v_combo_points <> '[[2,2,4,4],[2,1],[12]]'::jsonb
     OR v_totals <> '[12,3,12]'::jsonb
     OR (v_state#>>ARRAY['lastHandCount','playerHandScores',v_non_dealer::text,'fifteens'])::integer <> 4
     OR (v_state#>>ARRAY['lastHandCount','playerHandScores',v_non_dealer::text,'runs'])::integer <> 4
     OR (v_state#>>ARRAY['lastHandCount','playerHandScores',v_non_dealer::text,'flush'])::integer <> 4
     OR (v_state#>>'{lastHandCount,dealerHandScore,pairs}')::integer <> 2
     OR (v_state#>>'{lastHandCount,dealerHandScore,nobs}')::integer <> 1
     OR (v_state#>>'{lastHandCount,cribScore,pairs}')::integer <> 12 THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:counting_fifteen_flush_nobs_wrong:%', v_state;
  END IF;

  PERFORM public.cribbage_apply_discard(v_qualifying_round, v_qualifying_p1, ARRAY[0,1]);
  PERFORM public.cribbage_apply_discard(v_qualifying_round, v_qualifying_p2, ARRAY[0,1]);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = v_qualifying_round;
  v_crib_score := private.cribbage_hand_score(v_state->'crib', v_state->'cutCard', true);
  IF v_state#>>'{cutCard,rank}' <> '5'
     OR v_state#>>'{cutCard,suit}' <> 'clubs'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_state->'crib') card WHERE card->>'suit' <> 'clubs')
     OR (v_crib_score->>'flush')::integer <> 5 THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:qualifying_crib_flush_wrong:%:%', v_state, v_crib_score;
  END IF;

  PERFORM public.cribbage_apply_discard(v_nonqualifying_round, v_nonqualifying_p1, ARRAY[0,1]);
  PERFORM public.cribbage_apply_discard(v_nonqualifying_round, v_nonqualifying_p2, ARRAY[0,1]);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id = v_nonqualifying_round;
  v_crib_score := private.cribbage_hand_score(v_state->'crib', v_state->'cutCard', true);
  IF v_state#>>'{cutCard,rank}' <> '5'
     OR v_state#>>'{cutCard,suit}' <> 'hearts'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_state->'crib') card WHERE card->>'suit' <> 'clubs')
     OR (v_crib_score->>'flush')::integer <> 0 THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:nonqualifying_crib_flush_wrong:%:%', v_state, v_crib_score;
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin, 'role', 'authenticated'
  )::text, true);
  IF coalesce((public.get_cribbage_rule_branch_harness(v_combo_game)->>'armed')::boolean, false)
     OR public.get_cribbage_rule_branch_harness(v_combo_game)->>'consumedAt' IS NULL
     OR coalesce((public.get_cribbage_rule_branch_harness(v_qualifying_game)->>'armed')::boolean, false)
     OR public.get_cribbage_rule_branch_harness(v_qualifying_game)->>'consumedAt' IS NULL
     OR coalesce((public.get_cribbage_rule_branch_harness(v_nonqualifying_game)->>'armed')::boolean, false)
     OR public.get_cribbage_rule_branch_harness(v_nonqualifying_game)->>'consumedAt' IS NULL THEN
    RAISE EXCEPTION 'cribbage_combo_fixture_proof:new_profile_not_consumed_once';
  END IF;
END;
$proof$;
