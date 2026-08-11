-- Rollback-only proof for authoritative Holm Rabbit Hunt settlement.
-- Covers authorization, continuation, Rabbit Hunt on/off, duplicate/replay,
-- late replay, and terminal-state preservation. Winner and tie settlement are
-- covered in the companion Holm staged-transfer proof run in the same pass.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_off_game_id uuid := gen_random_uuid();
  v_off_dealer_game_id uuid := gen_random_uuid();
  v_human_id uuid;
  v_bot_id uuid;
  v_off_human_id uuid;
  v_off_bot_id uuid;
  v_round_id uuid;
  v_off_round_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_late_replay jsonb;
  v_result_count integer;
  v_human_chips integer;
  v_bot_chips integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 3
    ) profiles;
  IF coalesce(cardinality(v_users), 0) < 3 THEN
    RAISE EXCEPTION 'holm_rabbit_proof:requires_three_profiles';
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    rabbit_hunt, pussy_tax_enabled, pussy_tax_value
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm Rabbit Hunt', 'ante_decision',
    'holm-game', v_dealer_game_id, v_users[1], 2, true, 1, 0, false,
    true, true, 1
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', true);
  SELECT id INTO v_human_id FROM public.players
   WHERE game_id = v_game_id AND is_bot = false;
  SELECT id INTO v_bot_id FROM public.players
   WHERE game_id = v_game_id AND is_bot = true;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );
  PERFORM public.start_holm_initial_hand(v_game_id, false);
  SELECT id INTO v_round_id FROM public.rounds
   WHERE game_id = v_game_id AND dealer_game_id = v_dealer_game_id AND hand_number = 1;

  PERFORM set_config('request.jwt.claim.sub', v_users[3]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[3], 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.holm_submit_decision(v_game_id, v_human_id, 'fold');
    RAISE EXCEPTION 'holm_rabbit_proof:unauthorized_call_was_accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'holm_rabbit_proof:unauthorized_call_was_accepted'
         OR SQLERRM NOT LIKE '%holm_submit_decision:not_participant%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  SELECT public.holm_submit_decision(v_game_id, v_human_id, 'fold') INTO v_result;
  IF coalesce((v_result->>'all_decisions_in')::boolean, false) THEN
    RAISE EXCEPTION 'holm_rabbit_proof:first_fold_resolved_early:%', v_result;
  END IF;

  SELECT public.holm_submit_decision(v_game_id, v_bot_id, 'fold') INTO v_result;
  IF coalesce((v_result->>'server_resolved')::boolean, false) IS NOT TRUE
     OR v_result->>'event_kind' <> 'pussy_tax_carryforward' THEN
    RAISE EXCEPTION 'holm_rabbit_proof:all_fold_not_server_resolved:%', v_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rounds
     WHERE id = v_round_id
       AND status = 'completed'
       AND community_cards_revealed = 4
  ) THEN
    RAISE EXCEPTION 'holm_rabbit_proof:rabbit_reveal_not_atomic';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.games
     WHERE id = v_game_id
       AND status = 'in_progress'
       AND awaiting_next_round = true
       AND last_round_result = 'Pussy Tax!'
       AND pot = 4
  ) THEN
    RAISE EXCEPTION 'holm_rabbit_proof:continuation_state_invalid';
  END IF;
  SELECT chips INTO v_human_chips FROM public.players WHERE id = v_human_id;
  SELECT chips INTO v_bot_chips FROM public.players WHERE id = v_bot_id;
  IF v_human_chips <> 98 OR v_bot_chips <> 98 THEN
    RAISE EXCEPTION 'holm_rabbit_proof:tax_or_ante_not_exactly_once:%/%', v_human_chips, v_bot_chips;
  END IF;
  SELECT count(*) INTO v_result_count FROM public.game_results
   WHERE game_id = v_game_id AND dealer_game_id = v_dealer_game_id
     AND hand_number = 1 AND event_kind = 'pussy_tax_carryforward';
  IF v_result_count <> 1 THEN
    RAISE EXCEPTION 'holm_rabbit_proof:result_count:%', v_result_count;
  END IF;

  SELECT public.holm_submit_decision(v_game_id, v_bot_id, 'fold') INTO v_replay;
  IF coalesce((v_replay->>'round_not_betting')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'holm_rabbit_proof:decision_replay_not_rejected:%', v_replay;
  END IF;
  IF (SELECT chips FROM public.players WHERE id = v_human_id) <> v_human_chips
     OR (SELECT chips FROM public.players WHERE id = v_bot_id) <> v_bot_chips
     OR (SELECT count(*) FROM public.game_results
          WHERE game_id = v_game_id AND dealer_game_id = v_dealer_game_id
            AND hand_number = 1 AND event_kind = 'pussy_tax_carryforward') <> 1 THEN
    RAISE EXCEPTION 'holm_rabbit_proof:decision_replay_mutated_state';
  END IF;

  UPDATE public.games SET status = 'session_ended' WHERE id = v_game_id;
  SELECT public.holm_settle_hand(
    v_game_id, v_dealer_game_id, 1, 'pussy_tax_carryforward',
    999, true, 'ignored late replay',
    jsonb_build_object(v_human_id::text, -99, v_bot_id::text, -99),
    'ignored late replay', NULL, 'Pussy Tax', false, 0,
    true, 999, false, false
  ) INTO v_late_replay;
  IF v_late_replay->>'status' <> 'already_settled'
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'session_ended'
     OR (SELECT pot FROM public.games WHERE id = v_game_id) <> 4
     OR (SELECT chips FROM public.players WHERE id = v_human_id) <> v_human_chips
     OR (SELECT chips FROM public.players WHERE id = v_bot_id) <> v_bot_chips THEN
    RAISE EXCEPTION 'holm_rabbit_proof:late_replay_changed_terminal_state:%', v_late_replay;
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    rabbit_hunt, pussy_tax_enabled, pussy_tax_value
  ) VALUES (
    v_off_game_id, 'Codex rollback proof - Holm Rabbit Hunt off', 'ante_decision',
    'holm-game', v_off_dealer_game_id, v_users[1], 2, true, 1, 0, false,
    false, true, 1
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_off_dealer_game_id, v_off_game_id, v_users[1], 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_off_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_off_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', true);
  SELECT id INTO v_off_human_id FROM public.players
   WHERE game_id = v_off_game_id AND is_bot = false;
  SELECT id INTO v_off_bot_id FROM public.players
   WHERE game_id = v_off_game_id AND is_bot = true;
  PERFORM public.start_holm_initial_hand(v_off_game_id, false);
  SELECT id INTO v_off_round_id FROM public.rounds
   WHERE game_id = v_off_game_id AND dealer_game_id = v_off_dealer_game_id AND hand_number = 1;
  PERFORM public.holm_submit_decision(v_off_game_id, v_off_human_id, 'fold');
  SELECT public.holm_submit_decision(v_off_game_id, v_off_bot_id, 'fold') INTO v_result;
  IF coalesce((v_result->>'server_resolved')::boolean, false) IS NOT TRUE
     OR (SELECT community_cards_revealed FROM public.rounds WHERE id = v_off_round_id) <> 2 THEN
    RAISE EXCEPTION 'holm_rabbit_proof:rabbit_off_reveal_changed:%', v_result;
  END IF;
END;
$proof$;

ROLLBACK;
