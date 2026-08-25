-- Rollback-only proof for authoritative 3-5-7 LAST HAND requests.
BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_outsider uuid := gen_random_uuid();
  v_active_game uuid := gen_random_uuid();
  v_active_dealer uuid := gen_random_uuid();
  v_pregame uuid := gen_random_uuid();
  v_late_game uuid := gen_random_uuid();
  v_late_dealer uuid := gen_random_uuid();
  v_tie_game uuid := gen_random_uuid();
  v_tie_dealer uuid := gen_random_uuid();
  v_ended_game uuid := gen_random_uuid();
  v_player uuid;
  v_result jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id) INTO v_users
    FROM (SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2) profile_rows;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION '357_session_end_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[1])::text,
    true
  );
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  INSERT INTO public.games(
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, ante_amount, rollover_amount, leg_value, legs_to_win,
    total_hands, pot, real_money
  ) VALUES
    (v_active_game, '357 session end active proof', 'in_progress', '3-5-7', v_active_dealer,
     NULL, 1, 1, 1, 1, 3, 1, 2, false),
    (v_pregame, '357 session end pregame proof', 'game_selection', '3-5-7', NULL,
     v_users[1], 1, 1, 1, 1, 3, 0, 0, false),
    (v_late_game, '357 session end late proof', 'game_over', '3-5-7', v_late_dealer,
     v_users[1], 1, 1, 1, 1, 3, 4, 2, false),
    (v_tie_game, '357 session end tie proof', 'game_over', '3-5-7', v_tie_dealer,
     v_users[1], 1, 1, 1, 1, 3, 2, 2, false),
    (v_ended_game, '357 session end ended proof', 'session_ended', '3-5-7', NULL,
     v_users[1], 1, 1, 1, 1, 3, 0, 0, false);

  INSERT INTO public.dealer_games(id, session_id, dealer_user_id, game_type) VALUES
    (v_active_dealer, v_active_game, v_users[1], '3-5-7'),
    (v_late_dealer, v_late_game, v_users[1], '3-5-7'),
    (v_tie_dealer, v_tie_game, v_users[1], '3-5-7');

  INSERT INTO public.players(game_id, user_id, position, chips, status, sitting_out, is_bot)
  SELECT game_id, user_id, position, 100, 'active', false, false
    FROM (VALUES
      (v_active_game, v_users[1], 1), (v_active_game, v_users[2], 2),
      (v_pregame, v_users[1], 1), (v_pregame, v_users[2], 2),
      (v_late_game, v_users[1], 1), (v_late_game, v_users[2], 2),
      (v_tie_game, v_users[1], 1), (v_tie_game, v_users[2], 2),
      (v_ended_game, v_users[1], 1), (v_ended_game, v_users[2], 2)
    ) participants(game_id, user_id, position);

  UPDATE public.players
     SET created_at = clock_timestamp() - interval '1 second'
   WHERE game_id = v_active_game
     AND user_id = v_users[1];

  SELECT id INTO v_player FROM public.players
   WHERE game_id = v_late_game AND user_id = v_users[1];
  INSERT INTO public.game_results(
    game_id, dealer_game_id, hand_number, winner_player_id, winner_username,
    winning_hand_description, pot_won, player_chip_changes, is_chopped,
    game_type, settlement_key
  ) VALUES (
    v_late_game, v_late_dealer, 4, v_player, 'proof', 'proof terminal winner',
    2, '{}'::jsonb, false, '3-5-7', 'three_five_seven_terminal'
  );
  PERFORM set_config('app.three_five_seven_authoritative_write', 'off', true);

  -- Active request and replay: only LAST HAND changes; gameplay continues.
  SELECT public.three_five_seven_request_session_end(v_active_game) INTO v_result;
  IF v_result->>'terminal_disposition' <> 'pending_session_end'
     OR (SELECT pending_session_end FROM public.games WHERE id = v_active_game) IS NOT TRUE
     OR (SELECT status FROM public.games WHERE id = v_active_game) <> 'in_progress'
     OR (SELECT current_game_uuid FROM public.games WHERE id = v_active_game) <> v_active_dealer
     OR (SELECT total_hands FROM public.games WHERE id = v_active_game) <> 1 THEN
    RAISE EXCEPTION '357_session_end_proof:active_continuation_failed:%', v_result;
  END IF;
  SELECT public.three_five_seven_request_session_end(v_active_game) INTO v_result;
  IF v_result->>'terminal_disposition' <> 'pending_session_end' THEN
    RAISE EXCEPTION '357_session_end_proof:active_replay_failed:%', v_result;
  END IF;

  -- The other seated human cannot use the null-current_host fallback.
  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[2])::text,
    true
  );
  BEGIN
    PERFORM public.three_five_seven_request_session_end(v_active_game);
    RAISE EXCEPTION '357_session_end_proof:nonhost_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = '357_session_end_proof:nonhost_succeeded'
       OR SQLERRM NOT LIKE '%not_session_host%' THEN
      RAISE;
    END IF;
  END;

  -- An outsider is rejected before host resolution.
  PERFORM set_config('request.jwt.claim.sub', v_outsider::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_outsider)::text,
    true
  );
  BEGIN
    PERFORM public.three_five_seven_request_session_end(v_active_game);
    RAISE EXCEPTION '357_session_end_proof:outsider_succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = '357_session_end_proof:outsider_succeeded'
       OR SQLERRM NOT LIKE '%not_active_human_participant%' THEN
      RAISE;
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_users[1])::text,
    true
  );

  -- No live hand: session ends immediately and replay is terminal-idempotent.
  SELECT public.three_five_seven_request_session_end(v_pregame) INTO v_result;
  IF v_result->>'terminal_disposition' <> 'session_ended'
     OR (SELECT status FROM public.games WHERE id = v_pregame) <> 'session_ended' THEN
    RAISE EXCEPTION '357_session_end_proof:pregame_terminal_failed:%', v_result;
  END IF;
  SELECT public.three_five_seven_request_session_end(v_pregame) INTO v_result;
  IF coalesce((v_result->>'already_terminal')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '357_session_end_proof:pregame_replay_failed:%', v_result;
  END IF;

  -- Winner already settled: late request repairs disposition without replaying money.
  SELECT public.three_five_seven_request_session_end(v_late_game) INTO v_result;
  IF coalesce((v_result->>'late_terminal_repair')::boolean, false) IS NOT TRUE
     OR (SELECT status FROM public.games WHERE id = v_late_game) <> 'session_ended'
     OR (SELECT count(*) FROM public.game_results
          WHERE game_id = v_late_game AND settlement_key = 'three_five_seven_terminal') <> 1 THEN
    RAISE EXCEPTION '357_session_end_proof:late_repair_failed:%', v_result;
  END IF;
  SELECT public.three_five_seven_request_session_end(v_late_game) INTO v_result;
  IF coalesce((v_result->>'already_terminal')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '357_session_end_proof:late_replay_failed:%', v_result;
  END IF;

  -- A tie/nonterminal game_over cannot be falsely promoted to session_ended.
  BEGIN
    PERFORM public.three_five_seven_request_session_end(v_tie_game);
    RAISE EXCEPTION '357_session_end_proof:tie_promoted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = '357_session_end_proof:tie_promoted'
       OR SQLERRM NOT LIKE '%terminal_award_missing%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT status FROM public.games WHERE id = v_tie_game) <> 'game_over' THEN
    RAISE EXCEPTION '357_session_end_proof:tie_state_mutated';
  END IF;

  SELECT public.three_five_seven_request_session_end(v_ended_game) INTO v_result;
  IF coalesce((v_result->>'already_terminal')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '357_session_end_proof:terminal_replay_failed:%', v_result;
  END IF;
END;
$proof$;

ROLLBACK;
