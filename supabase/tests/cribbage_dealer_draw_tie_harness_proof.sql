-- Execute inside BEGIN after the candidate migration and always ROLLBACK.
-- Every game, player, dealer-game, round, and fixture mutation below is synthetic.

DO $proof$
DECLARE
  v_admin uuid;
  v_non_admin uuid;
  v_game uuid := gen_random_uuid();
  v_dealer_game uuid := gen_random_uuid();
  v_other_game uuid := gen_random_uuid();
  v_expired_game uuid := gen_random_uuid();
  v_real_game uuid := gen_random_uuid();
  v_terminal_game uuid := gen_random_uuid();
  v_state jsonb;
  v_replay jsonb;
  v_result jsonb;
  v_setting jsonb;
  v_original_harnesses_mode jsonb;
  v_round_id uuid;
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
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:missing_admin_or_non_admin';
  END IF;

  SELECT setting.value INTO v_original_harnesses_mode
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode';

  INSERT INTO public.games (
    id, name, game_type, status, real_money, ante_amount, buy_in, pot,
    current_round, total_hands, points_to_win, is_first_hand, current_host
  ) VALUES
    (v_game, 'Crib tie fixture proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 31, true, v_admin),
    (v_other_game, 'Crib tie isolation proof', 'cribbage', 'cribbage_dealer_selection', false, 1, 100, 0, NULL, 0, 31, true, v_admin),
    (v_expired_game, 'Crib tie expiry proof', 'cribbage', 'waiting', false, 1, 100, 0, NULL, 0, 31, true, v_admin),
    (v_real_game, 'Crib tie real-money rejection', 'cribbage', 'waiting', true, 1, 100, 0, NULL, 0, 31, true, v_admin),
    (v_terminal_game, 'Crib tie terminal rejection', 'cribbage', 'session_ended', false, 1, 100, 0, NULL, 0, 31, true, v_admin);
  INSERT INTO public.players (game_id, user_id, position, chips, is_bot, status)
  VALUES
    (v_game, v_admin, 1, 100, false, 'active'),
    (v_game, v_non_admin, 2, 100, false, 'active'),
    (v_other_game, v_admin, 1, 100, false, 'active'),
    (v_other_game, v_non_admin, 2, 100, false, 'active'),
    (v_expired_game, v_admin, 1, 100, false, 'active'),
    (v_expired_game, v_non_admin, 2, 100, false, 'active'),
    (v_real_game, v_admin, 1, 100, false, 'active'),
    (v_real_game, v_non_admin, 2, 100, false, 'active'),
    (v_terminal_game, v_admin, 1, 100, false, 'active'),
    (v_terminal_game, v_non_admin, 2, 100, false, 'active');

  -- Authorization and safety: a non-admin cannot arm; a real-money or terminal
  -- session cannot be armed even by an admin.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_non_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.arm_cribbage_dealer_draw_tie_harness(v_game, 600);
  IF v_result->>'outcome' <> 'not_authorized' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:non_admin_arm_allowed:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.arm_cribbage_dealer_draw_tie_harness(v_real_game, 600);
  IF v_result->>'outcome' <> 'real_money_forbidden' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:real_money_arm_allowed:%', v_result;
  END IF;
  v_result := public.arm_cribbage_dealer_draw_tie_harness(v_terminal_game, 600);
  IF v_result->>'outcome' <> 'wrong_status' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:terminal_arm_allowed:%', v_result;
  END IF;

  -- Exact-game scope: another Cribbage draw cannot consume the request.
  v_result := public.arm_cribbage_dealer_draw_tie_harness(v_game, 600);
  IF v_result->>'outcome' <> 'armed' OR (v_result->>'gameId')::uuid <> v_game THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:admin_arm_failed:%', v_result;
  END IF;
  v_state := public.cribbage_prepare_dealer_selection(v_other_game);
  IF v_state ? 'harnessApplied' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:wrong_game_consumed:%', v_state;
  END IF;
  v_result := public.get_cribbage_dealer_draw_tie_harness(v_game);
  IF NOT coalesce((v_result->>'armed')::boolean, false) THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:wrong_game_disarmed_request:%', v_result;
  END IF;

  -- Tie/winner: the exact game receives two legal waves and one winner.
  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games SET status = 'cribbage_dealer_selection' WHERE id = v_game;
  v_state := public.cribbage_prepare_dealer_selection(v_game);
  IF v_state->>'harnessApplied' <> 'force_first_round_tie_once'
     OR jsonb_array_length(v_state->'cards') <> 4
     OR (v_state->>'winnerPosition')::integer <> 1 THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:wrong_forced_state:%', v_state;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_state->'cards') card
       WHERE (card->>'roundNumber')::integer = 1 AND card#>>'{card,rank}' = 'A') <> 2
     OR (SELECT count(*) FROM jsonb_array_elements(v_state->'cards') card
         WHERE (card->>'roundNumber')::integer = 2) <> 2
     OR (SELECT count(DISTINCT (card#>>'{card,rank}') || ':' || (card#>>'{card,suit}'))
           FROM jsonb_array_elements(v_state->'cards') card) <> 4 THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:tie_waves_invalid:%', v_state;
  END IF;
  v_result := public.get_cribbage_dealer_draw_tie_harness(v_game);
  IF coalesce((v_result->>'armed')::boolean, false) OR v_result->>'consumedAt' IS NULL THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:not_consumed_once:%', v_result;
  END IF;

  -- Duplicate/replay returns the same immutable prepared state.
  v_replay := public.cribbage_prepare_dealer_selection(v_game);
  IF v_replay IS DISTINCT FROM v_state THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:duplicate_changed_state:%', v_replay;
  END IF;

  -- Continuation uses the unchanged Cribbage first-hand authority and a late
  -- fixture replay cannot mutate the live hand.
  INSERT INTO public.dealer_games (id, dealer_user_id, game_type, session_id, config)
  VALUES (v_dealer_game, v_admin, 'cribbage', v_game, '{}'::jsonb);
  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games SET current_game_uuid = v_dealer_game WHERE id = v_game;
  v_result := public.start_cribbage_initial_hand(v_game);
  IF v_result->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:continuation_failed:%', v_result;
  END IF;
  SELECT round_row.id INTO v_round_id
    FROM public.rounds round_row
   WHERE round_row.game_id = v_game
     AND round_row.dealer_game_id = v_dealer_game
     AND round_row.hand_number = 1;
  IF v_round_id IS NULL OR (SELECT status FROM public.games WHERE id = v_game) <> 'in_progress' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:continuation_state_missing';
  END IF;
  v_replay := public.cribbage_prepare_dealer_selection(v_game);
  IF v_replay->>'outcome' <> 'rejected' OR v_replay->>'reason' <> 'wrong_status' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:late_replay_not_rejected:%', v_replay;
  END IF;

  -- Expiry: an expired exact-game request never marks a normal draw as forced.
  v_result := public.arm_cribbage_dealer_draw_tie_harness(v_expired_game, 600);
  UPDATE public.system_settings
     SET value = jsonb_set(
       value,
       ARRAY['requests', v_expired_game::text, 'expiresAt'],
       to_jsonb((clock_timestamp() - interval '1 second')::text),
       false
     )
   WHERE key = 'cribbage_dealer_draw_tie_harness';
  PERFORM set_config('app.cribbage_authoritative_write', 'on', true);
  UPDATE public.games SET status = 'cribbage_dealer_selection' WHERE id = v_expired_game;
  v_state := public.cribbage_prepare_dealer_selection(v_expired_game);
  IF v_state ? 'harnessApplied' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:expired_request_applied:%', v_state;
  END IF;

  -- Cancel is exact-owner and replay-safe after either arm or consume.
  v_result := public.cancel_cribbage_dealer_draw_tie_harness(v_game);
  IF v_result->>'outcome' <> 'cancelled' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:owner_cancel_failed:%', v_result;
  END IF;
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_non_admin, 'role', 'authenticated'
  )::text, true);
  v_result := public.cancel_cribbage_dealer_draw_tie_harness(v_game);
  IF v_result->>'outcome' <> 'not_authorized' THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:non_admin_cancel_allowed:%', v_result;
  END IF;

  SELECT setting.value INTO v_setting
    FROM public.system_settings setting WHERE setting.key = 'harnesses_mode';
  IF v_setting IS DISTINCT FROM v_original_harnesses_mode THEN
    RAISE EXCEPTION 'cribbage_tie_fixture_proof:global_harness_gate_mutated';
  END IF;
END;
$proof$;
