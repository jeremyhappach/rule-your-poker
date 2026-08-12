-- Rollback-only proof for the service-only Holm deadline adapter.
-- The timeout path must preserve the normal Chucky presentation, reject stale
-- and replayed calls, and retain the existing human auto-fold contract.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_fold_game_id uuid := gen_random_uuid();
  v_fold_dealer_game_id uuid := gen_random_uuid();
  v_stayer_id uuid;
  v_folder_id uuid;
  v_fold_target_id uuid;
  v_fold_other_id uuid;
  v_round_id uuid;
  v_fold_round_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_result_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'holm_deadline_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.holm_apply_deadline_decision(uuid,uuid,uuid,text,boolean)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.holm_apply_deadline_decision(uuid,uuid,uuid,text,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'holm_deadline_proof:browser_role_can_call_service_adapter';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'service_role')::text,
    true
  );

  UPDATE public.system_settings
     SET value = jsonb_build_object('enabled', false)
   WHERE key = 'harnesses_mode';

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm deadline Chucky loss', 'ante_decision',
    'holm-game', v_dealer_game_id, v_users[1], 2, true, 1, 0, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  SELECT id INTO v_stayer_id FROM public.players WHERE game_id = v_game_id AND position = 1;
  SELECT id INTO v_folder_id FROM public.players WHERE game_id = v_game_id AND position = 2;
  PERFORM public.start_holm_initial_hand(v_game_id, false);
  SELECT id INTO v_round_id FROM public.rounds WHERE game_id = v_game_id;

  UPDATE public.rounds
     SET current_turn_position = 1,
         decision_deadline = now() - interval '1 second',
         community_cards = jsonb_build_array(
           jsonb_build_object('rank','9','suit',chr(9830)),
           jsonb_build_object('rank','3','suit',chr(9830)),
           jsonb_build_object('rank','Q','suit',chr(9829)),
           jsonb_build_object('rank','5','suit',chr(9824))
         ),
         chucky_cards = jsonb_build_array(
           jsonb_build_object('rank','6','suit',chr(9827)),
           jsonb_build_object('rank','A','suit',chr(9829)),
           jsonb_build_object('rank','5','suit',chr(9829)),
           jsonb_build_object('rank','6','suit',chr(9830))
         )
   WHERE id = v_round_id;
  UPDATE public.player_cards
     SET cards = jsonb_build_array(
       jsonb_build_object('rank','6','suit',chr(9824)),
       jsonb_build_object('rank','A','suit',chr(9824)),
       jsonb_build_object('rank','K','suit',chr(9829)),
       jsonb_build_object('rank','A','suit',chr(9827))
     )
   WHERE round_id = v_round_id AND player_id = v_stayer_id;
  UPDATE public.players
     SET current_decision = 'fold', decision_locked = true
   WHERE id = v_folder_id;

  SELECT public.holm_apply_deadline_decision(
    v_game_id, v_round_id, v_stayer_id, 'stay', false
  ) INTO v_result;
  IF v_result->>'event_kind' <> 'chucky_loss_pot_match'
     OR coalesce((v_result->>'deadline_applied')::boolean, false) IS NOT TRUE
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'in_progress'
     OR (SELECT pot FROM public.games WHERE id = v_game_id) <> 4
     OR (SELECT chips FROM public.players WHERE id = v_stayer_id) <> 97
     OR (SELECT chucky_active FROM public.rounds WHERE id = v_round_id) IS DISTINCT FROM true
     OR (SELECT chucky_cards_revealed FROM public.rounds WHERE id = v_round_id) <> 4
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'completed' THEN
    RAISE EXCEPTION 'holm_deadline_proof:canonical_chucky_loss_not_preserved:%', v_result;
  END IF;

  SELECT count(*) INTO v_result_count
  FROM public.game_results
  WHERE game_id = v_game_id;
  SELECT public.holm_apply_deadline_decision(
    v_game_id, v_round_id, v_stayer_id, 'stay', false
  ) INTO v_replay;
  IF coalesce((v_replay->>'round_not_betting')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.game_results WHERE game_id = v_game_id) <> v_result_count THEN
    RAISE EXCEPTION 'holm_deadline_proof:replay_mutated_settlement:%', v_replay;
  END IF;

  SELECT public.holm_apply_deadline_decision(
    v_game_id, gen_random_uuid(), v_stayer_id, 'stay', false
  ) INTO v_replay;
  IF coalesce((v_replay->>'stale_round')::boolean, false) IS NOT TRUE
     OR (SELECT count(*) FROM public.game_results WHERE game_id = v_game_id) <> v_result_count THEN
    RAISE EXCEPTION 'holm_deadline_proof:late_replay_mutated_settlement:%', v_replay;
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_fold_game_id, 'Codex rollback proof - Holm deadline auto-fold', 'ante_decision',
    'holm-game', v_fold_dealer_game_id, v_users[1], 2, true, 1, 0, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_fold_dealer_game_id, v_fold_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_fold_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_fold_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);
  SELECT id INTO v_fold_target_id FROM public.players WHERE game_id = v_fold_game_id AND position = 1;
  SELECT id INTO v_fold_other_id FROM public.players WHERE game_id = v_fold_game_id AND position = 2;
  PERFORM public.start_holm_initial_hand(v_fold_game_id, false);
  SELECT id INTO v_fold_round_id FROM public.rounds WHERE game_id = v_fold_game_id;
  UPDATE public.rounds
     SET current_turn_position = 1,
         decision_deadline = now() - interval '1 second'
   WHERE id = v_fold_round_id;
  UPDATE public.players
     SET current_decision = 'fold', decision_locked = true
   WHERE id = v_fold_other_id;

  SELECT public.holm_apply_deadline_decision(
    v_fold_game_id, v_fold_round_id, v_fold_target_id, 'fold', true
  ) INTO v_result;
  IF v_result->>'event_kind' <> 'pussy_tax_carryforward'
     OR (SELECT auto_fold FROM public.players WHERE id = v_fold_target_id) IS DISTINCT FROM true
     OR (SELECT sit_out_next_hand FROM public.players WHERE id = v_fold_target_id) IS DISTINCT FROM true
     OR (SELECT status FROM public.rounds WHERE id = v_fold_round_id) <> 'completed' THEN
    RAISE EXCEPTION 'holm_deadline_proof:auto_fold_not_canonical:%', v_result;
  END IF;

  RAISE NOTICE 'holm_deadline_canonical_settlement_proof:passed';
END;
$proof$;

ROLLBACK;
