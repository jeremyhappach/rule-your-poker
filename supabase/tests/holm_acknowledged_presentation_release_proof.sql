-- Rollback-only proof for event-driven Holm continuation. Covers winner/tie
-- predecessors, immutable human cohorts, partial/final/duplicate/late acks,
-- authorization, pause/resume, no-client fallback, bot-only continuation,
-- exact deadlines, terminal rejection, and replay safety.
BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_user_one uuid;
  v_user_two uuid;
  v_unauthorized uuid := gen_random_uuid();
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_predecessor_id uuid := gen_random_uuid();
  v_successor_id uuid;
  v_pause_game_id uuid := gen_random_uuid();
  v_pause_dealer_game_id uuid := gen_random_uuid();
  v_pause_predecessor_id uuid := gen_random_uuid();
  v_pause_successor_id uuid;
  v_fallback_game_id uuid := gen_random_uuid();
  v_fallback_dealer_game_id uuid := gen_random_uuid();
  v_fallback_predecessor_id uuid := gen_random_uuid();
  v_fallback_successor_id uuid;
  v_bot_game_id uuid := gen_random_uuid();
  v_bot_dealer_game_id uuid := gen_random_uuid();
  v_bot_predecessor_id uuid := gen_random_uuid();
  v_bot_successor_id uuid;
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_terminal_predecessor_id uuid := gen_random_uuid();
  v_result jsonb;
  v_replay jsonb;
  v_deadline_before timestamptz;
  v_deadline_after timestamptz;
  v_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id) INTO v_users
  FROM (
    SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2
  ) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'holm_ack_release_proof:requires_two_profiles';
  END IF;
  v_user_one := v_users[1];
  v_user_two := v_users[2];

  IF has_function_privilege('anon', 'public.acknowledge_holm_prepared_hand_dealt(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.acknowledge_holm_prepared_hand_dealt(uuid,uuid,uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.activate_prepared_holm_hand(uuid,uuid,uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'private.release_due_holm_presentations()', 'EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM cron.job
       WHERE jobname = 'release-due-holm-presentations-1s'
         AND schedule = '1 second'
     ) THEN
    RAISE EXCEPTION 'holm_ack_release_proof:grants_or_cron_invalid';
  END IF;

  IF (SELECT holm_presentation_ack_fallback_seconds FROM public.game_defaults WHERE game_type = 'holm') <> 30 THEN
    RAISE EXCEPTION 'holm_ack_release_proof:fallback_default_not_configured';
  END IF;

  -- Winner continuation: two required humans. H2 stays non-actionable after
  -- preparation and after the first acknowledgement.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, last_round_result
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm acknowledged winner',
    'in_progress', 'holm-game', v_dealer_game_id, v_user_one,
    1, 1, 1, 1, false, 1, 20, false,
    true, 'Proof Player won with Straight. |||WINNER:proof|||LOSERS:other|||POT:10|||MATCH:10'
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_user_one, 'holm');
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, current_decision, decision_locked, is_bot
  ) VALUES
    (v_game_id, v_user_one, 1, 100, 'active', false, 'ante_up', 'stay', true, false),
    (v_game_id, v_user_two, 5, 100, 'active', false, 'ante_up', 'stay', true, false);
  INSERT INTO public.rounds (
    id, game_id, round_number, cards_dealt, status, pot,
    hand_number, dealer_game_id, holm_turn_sequence,
    community_cards, community_cards_revealed
  ) VALUES (
    v_predecessor_id, v_game_id, 1, 4, 'completed', 20,
    1, v_dealer_game_id, 2, '[]'::jsonb, 4
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_one::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_one, 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_game_id, v_predecessor_id) INTO v_result;
  v_successor_id := (v_result->>'round_id')::uuid;

  SELECT count(*)::integer INTO v_count
  FROM private.holm_hand_presentation_ack_requirements
  WHERE successor_round_id = v_successor_id;
  IF v_result->>'outcome' <> 'prepared'
     OR (v_result->>'acknowledgements_required')::integer <> 2
     OR v_count <> 2
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'dealing'
     OR (SELECT current_turn_position FROM public.rounds WHERE id = v_successor_id) IS NOT NULL
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_successor_id) IS NOT NULL
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 1
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM true
     OR (SELECT buck_transfer_presentation->>'roundId' FROM public.games WHERE id = v_game_id) <> v_successor_id::text
     OR (SELECT buck_transfer_presentation->>'handContextId' FROM public.games WHERE id = v_game_id) <> v_successor_id::text
     OR (SELECT presentation_fallback_at FROM public.rounds WHERE id = v_successor_id) < clock_timestamp() + interval '20 seconds' THEN
    RAISE EXCEPTION 'holm_ack_release_proof:prepared_successor_invalid:%', v_result;
  END IF;

  SELECT public.prepare_next_holm_hand(v_game_id, v_predecessor_id) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-prepared'
     OR (v_replay->>'round_id')::uuid <> v_successor_id
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_game_id) <> 2
     OR (SELECT count(*) FROM private.holm_hand_presentation_ack_requirements WHERE successor_round_id = v_successor_id) <> 2 THEN
    RAISE EXCEPTION 'holm_ack_release_proof:prepare_replay_mutated:%', v_replay;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_unauthorized, 'role', 'authenticated')::text, true);
  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_game_id, v_dealer_game_id, v_predecessor_id, v_successor_id, 2
  ) INTO v_result;
  IF v_result->>'reason' <> 'acknowledgement-not-required-for-caller'
     OR EXISTS (
       SELECT 1 FROM private.holm_hand_presentation_ack_requirements
       WHERE successor_round_id = v_successor_id AND acknowledged_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'holm_ack_release_proof:unauthorized_ack_mutated:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user_one::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_one, 'role', 'authenticated')::text, true);
  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_game_id, v_dealer_game_id, v_predecessor_id, v_successor_id, 999
  ) INTO v_result;
  IF v_result->>'reason' <> 'stale-hand-identity' THEN
    RAISE EXCEPTION 'holm_ack_release_proof:wrong_identity_ack_accepted:%', v_result;
  END IF;

  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_game_id, v_dealer_game_id, v_predecessor_id, v_successor_id, 2
  ) INTO v_result;
  IF v_result->>'outcome' <> 'acknowledged-waiting'
     OR (v_result->>'pending_acknowledgements')::integer <> 1
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'dealing'
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_successor_id) IS NOT NULL THEN
    RAISE EXCEPTION 'holm_ack_release_proof:partial_ack_activated:%', v_result;
  END IF;

  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_game_id, v_dealer_game_id, v_predecessor_id, v_successor_id, 2
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'acknowledged-waiting'
     OR (v_replay->>'deduped')::boolean IS DISTINCT FROM true
     OR (SELECT count(*) FROM private.holm_hand_presentation_ack_requirements WHERE successor_round_id = v_successor_id) <> 2 THEN
    RAISE EXCEPTION 'holm_ack_release_proof:duplicate_partial_ack_mutated:%', v_replay;
  END IF;

  v_deadline_before := clock_timestamp();
  PERFORM set_config('request.jwt.claim.sub', v_user_two::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_two, 'role', 'authenticated')::text, true);
  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_game_id, v_dealer_game_id, v_predecessor_id, v_successor_id, 2
  ) INTO v_result;
  SELECT decision_deadline INTO v_deadline_after FROM public.rounds WHERE id = v_successor_id;
  IF v_result->>'outcome' <> 'activated'
     OR (v_result->>'from_fallback')::boolean IS DISTINCT FROM false
     OR (SELECT status FROM public.rounds WHERE id = v_successor_id) <> 'betting'
     OR (SELECT total_hands FROM public.games WHERE id = v_game_id) <> 2
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM false
     OR v_deadline_after IS NULL
     OR v_deadline_after <= v_deadline_before
     OR EXISTS (
       SELECT 1 FROM public.players
       WHERE game_id = v_game_id AND (decision_locked OR current_decision IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'holm_ack_release_proof:final_ack_not_atomic:%', v_result;
  END IF;

  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_game_id, v_dealer_game_id, v_predecessor_id, v_successor_id, 2
  ) INTO v_replay;
  IF v_replay->>'outcome' <> 'already-active'
     OR (SELECT decision_deadline FROM public.rounds WHERE id = v_successor_id) IS DISTINCT FROM v_deadline_after THEN
    RAISE EXCEPTION 'holm_ack_release_proof:late_ack_replay_mutated:%', v_replay;
  END IF;

  -- Tie continuation: acknowledgements can arrive while paused, but activation
  -- waits for resume and then needs no new browser edge.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, last_round_result
  ) VALUES (
    v_pause_game_id, 'Codex rollback proof - Holm acknowledged tie',
    'in_progress', 'holm-game', v_pause_dealer_game_id, v_user_one,
    1, 1, 1, 1, false, 1, 20, false,
    true, 'Proof tie. |||WINNERS:a,b|||LOSERS:|||POT:0|||MATCH:0'
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_pause_dealer_game_id, v_pause_game_id, v_user_one, 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, decision_locked, is_bot)
  VALUES
    (v_pause_game_id, v_user_one, 1, 100, 'active', false, 'ante_up', true, false),
    (v_pause_game_id, v_user_two, 5, 100, 'active', false, 'ante_up', true, false);
  INSERT INTO public.rounds (id, game_id, round_number, cards_dealt, status, pot, hand_number, dealer_game_id, holm_turn_sequence)
  VALUES (v_pause_predecessor_id, v_pause_game_id, 1, 4, 'completed', 20, 1, v_pause_dealer_game_id, 2);

  PERFORM set_config('request.jwt.claim.sub', v_user_one::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_one, 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_pause_game_id, v_pause_predecessor_id) INTO v_result;
  v_pause_successor_id := (v_result->>'round_id')::uuid;
  UPDATE public.games SET is_paused = true WHERE id = v_pause_game_id;
  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_pause_game_id, v_pause_dealer_game_id, v_pause_predecessor_id, v_pause_successor_id, 2
  ) INTO v_result;
  PERFORM set_config('request.jwt.claim.sub', v_user_two::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_two, 'role', 'authenticated')::text, true);
  SELECT public.acknowledge_holm_prepared_hand_dealt(
    v_pause_game_id, v_pause_dealer_game_id, v_pause_predecessor_id, v_pause_successor_id, 2
  ) INTO v_result;
  IF v_result->>'outcome' <> 'acknowledged-paused'
     OR (SELECT status FROM public.rounds WHERE id = v_pause_successor_id) <> 'dealing' THEN
    RAISE EXCEPTION 'holm_ack_release_proof:paused_ack_activated:%', v_result;
  END IF;
  UPDATE public.games SET is_paused = false WHERE id = v_pause_game_id;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  SELECT to_jsonb(private.release_due_holm_presentations()) INTO v_result;
  IF (SELECT status FROM public.rounds WHERE id = v_pause_successor_id) <> 'betting'
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_pause_game_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'holm_ack_release_proof:resume_did_not_release_ack_complete:%', v_result;
  END IF;

  -- Missing acknowledgements never freeze forever: before the configurable
  -- lease nothing happens; once due the service activates the same H2.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, last_round_result
  ) VALUES (
    v_fallback_game_id, 'Codex rollback proof - Holm missing ack fallback',
    'in_progress', 'holm-game', v_fallback_dealer_game_id, v_user_one,
    1, 1, 1, 1, false, 1, 20, false,
    true, 'Everyone folded! No penalty.'
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_fallback_dealer_game_id, v_fallback_game_id, v_user_one, 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_fallback_game_id, v_user_one, 1, 100, 'active', false, 'ante_up', false),
    (v_fallback_game_id, v_user_two, 5, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, cards_dealt, status, pot, hand_number, dealer_game_id, holm_turn_sequence)
  VALUES (v_fallback_predecessor_id, v_fallback_game_id, 1, 4, 'completed', 20, 1, v_fallback_dealer_game_id, 2);
  PERFORM set_config('request.jwt.claim.sub', v_user_one::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_one, 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_fallback_game_id, v_fallback_predecessor_id) INTO v_result;
  v_fallback_successor_id := (v_result->>'round_id')::uuid;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  SELECT to_jsonb(private.release_due_holm_presentations()) INTO v_result;
  IF (SELECT status FROM public.rounds WHERE id = v_fallback_successor_id) <> 'dealing' THEN
    RAISE EXCEPTION 'holm_ack_release_proof:fallback_released_early:%', v_result;
  END IF;
  UPDATE public.rounds SET presentation_fallback_at = clock_timestamp() - interval '1 second'
  WHERE id = v_fallback_successor_id;
  SELECT to_jsonb(private.release_due_holm_presentations()) INTO v_result;
  IF (SELECT status FROM public.rounds WHERE id = v_fallback_successor_id) <> 'betting'
     OR (SELECT awaiting_next_round FROM public.games WHERE id = v_fallback_game_id) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'holm_ack_release_proof:fallback_did_not_activate:%', v_result;
  END IF;

  -- A bot-only successor has an empty human cohort and is service-released
  -- immediately; no browser can become an accidental dependency.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money,
    awaiting_next_round, last_round_result
  ) VALUES (
    v_bot_game_id, 'Codex rollback proof - Holm bot only',
    'in_progress', 'holm-game', v_bot_dealer_game_id, v_user_one,
    1, 1, 1, 1, false, 1, 20, false,
    true, 'Bot continuation'
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_bot_dealer_game_id, v_bot_game_id, v_user_one, 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES (v_bot_game_id, v_user_one, 1, 100, 'active', false, 'ante_up', true);
  INSERT INTO public.rounds (id, game_id, round_number, cards_dealt, status, pot, hand_number, dealer_game_id, holm_turn_sequence)
  VALUES (v_bot_predecessor_id, v_bot_game_id, 1, 4, 'completed', 20, 1, v_bot_dealer_game_id, 1);
  PERFORM set_config('request.jwt.claim.sub', v_user_one::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_one, 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_bot_game_id, v_bot_predecessor_id) INTO v_result;
  v_bot_successor_id := (v_result->>'round_id')::uuid;
  IF (v_result->>'acknowledgements_required')::integer <> 0 THEN
    RAISE EXCEPTION 'holm_ack_release_proof:bot_added_to_ack_cohort:%', v_result;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  SELECT to_jsonb(private.release_due_holm_presentations()) INTO v_result;
  IF (SELECT status FROM public.rounds WHERE id = v_bot_successor_id) <> 'betting' THEN
    RAISE EXCEPTION 'holm_ack_release_proof:bot_only_not_released:%', v_result;
  END IF;

  -- Terminal and late continuation calls remain inert.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, buck_position, current_round, total_hands,
    is_first_hand, ante_amount, pot, real_money, awaiting_next_round
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - Holm terminal',
    'session_ended', 'holm-game', v_terminal_dealer_game_id, v_user_one,
    1, 1, 1, 1, false, 1, 20, false, true
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_terminal_dealer_game_id, v_terminal_game_id, v_user_one, 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES (v_terminal_game_id, v_user_one, 1, 100, 'active', false, 'ante_up', false);
  INSERT INTO public.rounds (id, game_id, round_number, cards_dealt, status, pot, hand_number, dealer_game_id, holm_turn_sequence)
  VALUES (v_terminal_predecessor_id, v_terminal_game_id, 1, 4, 'completed', 20, 1, v_terminal_dealer_game_id, 1);
  PERFORM set_config('request.jwt.claim.sub', v_user_one::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_user_one, 'role', 'authenticated')::text, true);
  SELECT public.prepare_next_holm_hand(v_terminal_game_id, v_terminal_predecessor_id) INTO v_result;
  IF v_result->>'reason' <> 'terminal-state'
     OR (SELECT count(*) FROM public.rounds WHERE game_id = v_terminal_game_id) <> 1 THEN
    RAISE EXCEPTION 'holm_ack_release_proof:terminal_prepare_mutated:%', v_result;
  END IF;

  RAISE NOTICE 'holm_acknowledged_presentation_release_proof:passed';
END;
$proof$;

ROLLBACK;
