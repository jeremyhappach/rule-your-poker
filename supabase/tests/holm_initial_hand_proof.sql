-- Rollback-only proof for public.start_holm_initial_hand(uuid, boolean).
-- Requires two existing profiles only as FK parents; no persisted rows survive.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_continuation_game_id uuid := gen_random_uuid();
  v_continuation_dealer_game_id uuid := gen_random_uuid();
  v_paused_game_id uuid := gen_random_uuid();
  v_paused_dealer_game_id uuid := gen_random_uuid();
  v_terminal_game_id uuid := gen_random_uuid();
  v_terminal_dealer_game_id uuid := gen_random_uuid();
  v_unauthorized_id uuid := gen_random_uuid();
  v_first jsonb;
  v_duplicate jsonb;
  v_late_replay jsonb;
  v_rejected jsonb;
  v_round_id uuid;
  v_buck_event_id uuid;
  v_count integer;
  v_distinct_count integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (
      SELECT id, created_at
        FROM public.profiles
       ORDER BY created_at, id
       LIMIT 2
    ) available_users;

  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'holm_initial_proof:requires_two_profiles';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.start_holm_initial_hand(uuid,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:anon_execute_not_revoked';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.start_holm_initial_hand(uuid,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:authenticated_execute_missing';
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm initial', 'ante_decision',
    'holm-game', v_dealer_game_id, v_users[1],
    2, true, 1, 0, false
  );

  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_dealer_game_id, v_game_id, v_users[1], 'holm'
  );

  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized_id, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.start_holm_initial_hand(v_game_id, false);
    RAISE EXCEPTION 'holm_initial_proof:unauthorized_call_was_accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'holm_initial_proof:unauthorized_call_was_accepted'
         OR SQLERRM NOT LIKE '%start_holm_initial_hand:not_participant%' THEN
        RAISE;
      END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  SELECT public.start_holm_initial_hand(v_game_id, false) INTO v_first;
  IF v_first->>'outcome' <> 'started' THEN
    RAISE EXCEPTION 'holm_initial_proof:first_call_not_started:%', v_first;
  END IF;

  v_round_id := (v_first->>'round_id')::uuid;

  SELECT (buck_transfer_presentation->>'id')::uuid
    INTO v_buck_event_id
    FROM public.games
   WHERE id = v_game_id;

  IF v_buck_event_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.games
     WHERE id = v_game_id
       AND buck_transfer_presentation->>'sessionId' = v_game_id::text
       AND buck_transfer_presentation->>'dealerGameId' = v_dealer_game_id::text
       AND buck_transfer_presentation->>'roundId' = v_round_id::text
       AND buck_transfer_presentation->>'handContextId' = v_round_id::text
       AND (buck_transfer_presentation->>'handNumber')::integer = 1
       AND (buck_transfer_presentation->>'fromPosition')::integer = 2
       AND (buck_transfer_presentation->>'toPosition')::integer = 1
       AND buck_transfer_presentation->>'source' = 'SERVER_BUCK_TRANSFER'
       AND jsonb_typeof(buck_transfer_presentation->'sequence') = 'number'
       AND buck_transfer_presentation->>'createdAt' IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:h1_buck_event_invalid';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.rounds
   WHERE game_id = v_game_id
     AND dealer_game_id = v_dealer_game_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'holm_initial_proof:round_count:%', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.rounds
     WHERE id = v_round_id
       AND hand_number = 1
       AND round_number = 1
       AND status = 'betting'
       AND pot = 2
       AND community_cards_revealed = 2
       AND current_turn_position = 1
       AND jsonb_array_length(community_cards) = 4
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:round_shape_invalid';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.player_cards
   WHERE round_id = v_round_id
     AND jsonb_array_length(cards) = 4
     AND hand_context_id = v_round_id::text;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'holm_initial_proof:player_card_rows:%', v_count;
  END IF;

  WITH all_cards AS (
    SELECT card
      FROM public.rounds round_row
      CROSS JOIN LATERAL jsonb_array_elements(round_row.community_cards) card
     WHERE round_row.id = v_round_id
    UNION ALL
    SELECT card
      FROM public.player_cards player_card
      CROSS JOIN LATERAL jsonb_array_elements(player_card.cards) card
     WHERE player_card.round_id = v_round_id
  )
  SELECT count(*),
         count(DISTINCT (card->>'rank') || ':' || (card->>'suit'))
    INTO v_count, v_distinct_count
    FROM all_cards;
  IF v_count <> 12 OR v_distinct_count <> 12 THEN
    RAISE EXCEPTION 'holm_initial_proof:deal_not_unique:count=%,distinct=%',
      v_count, v_distinct_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.players
     WHERE game_id = v_game_id
       AND chips <> 99
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:ante_not_exactly_once';
  END IF;

  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize IMMEDIATE';
  IF NOT EXISTS (
    SELECT 1
      FROM public.gameplay_transfer_batches batch
     WHERE batch.game_id = v_game_id
       AND batch.cursor = 1
       AND batch.reason = 'ante'
       AND batch.opening_balances ->> 'pot' = '0'
       AND batch.closing_balances ->> 'pot' = '2'
       AND jsonb_array_length(batch.transfers) = 2
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:ante_transfer_not_canonical';
  END IF;
  EXECUTE 'SET CONSTRAINTS gameplay_transfer_pending_finalize DEFERRED';

  IF NOT EXISTS (
    SELECT 1
      FROM public.games
     WHERE id = v_game_id
       AND status = 'in_progress'
       AND current_round = 1
       AND total_hands = 1
       AND pot = 2
       AND buck_position = 1
       AND is_first_hand = false
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:game_pointer_invalid';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.game_results
   WHERE game_id = v_game_id
     AND dealer_game_id = v_dealer_game_id
     AND winner_username = 'Ante';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'holm_initial_proof:ante_audit_count:%', v_count;
  END IF;

  SELECT public.start_holm_initial_hand(v_game_id, false) INTO v_duplicate;
  IF v_duplicate->>'outcome' <> 'already-started'
     OR (v_duplicate->>'round_id')::uuid <> v_round_id THEN
    RAISE EXCEPTION 'holm_initial_proof:duplicate_not_deduped:%', v_duplicate;
  END IF;
  IF (SELECT (buck_transfer_presentation->>'id')::uuid
        FROM public.games WHERE id = v_game_id) <> v_buck_event_id THEN
    RAISE EXCEPTION 'holm_initial_proof:duplicate_replaced_h1_buck_event';
  END IF;

  UPDATE public.games
     SET status = 'game_over',
         last_round_result = 'Winner proof'
   WHERE id = v_game_id;
  SELECT public.start_holm_initial_hand(v_game_id, false) INTO v_late_replay;
  IF v_late_replay->>'outcome' <> 'already-started'
     OR (v_late_replay->>'round_id')::uuid <> v_round_id THEN
    RAISE EXCEPTION 'holm_initial_proof:winner_late_replay_failed:%', v_late_replay;
  END IF;

  UPDATE public.games
     SET status = 'session_ended',
         last_round_result = 'Tie proof'
   WHERE id = v_game_id;
  SELECT public.start_holm_initial_hand(v_game_id, false) INTO v_late_replay;
  IF v_late_replay->>'outcome' <> 'already-started'
     OR (v_late_replay->>'round_id')::uuid <> v_round_id THEN
    RAISE EXCEPTION 'holm_initial_proof:tie_late_replay_failed:%', v_late_replay;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.rounds
   WHERE game_id = v_game_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'holm_initial_proof:late_replay_created_round:%', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.players
     WHERE game_id = v_game_id
       AND chips <> 99
  ) THEN
    RAISE EXCEPTION 'holm_initial_proof:late_replay_moved_chips';
  END IF;

  IF (SELECT (buck_transfer_presentation->>'id')::uuid
        FROM public.games WHERE id = v_game_id) <> v_buck_event_id THEN
    RAISE EXCEPTION 'holm_initial_proof:late_replay_replaced_h1_buck_event';
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money, is_paused
  ) VALUES (
    v_paused_game_id, 'Codex rollback proof - Holm paused', 'ante_decision',
    'holm-game', v_paused_dealer_game_id, v_users[1],
    2, true, 1, 0, false, true
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_paused_dealer_game_id, v_paused_game_id, v_users[1], 'holm'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES
    (v_paused_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_paused_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);

  SELECT public.start_holm_initial_hand(v_paused_game_id, false) INTO v_rejected;
  IF v_rejected->>'outcome' <> 'rejected'
     OR v_rejected->>'reason' <> 'game-paused'
     OR EXISTS (SELECT 1 FROM public.rounds WHERE game_id = v_paused_game_id)
     OR (SELECT buck_transfer_presentation FROM public.games
          WHERE id = v_paused_game_id) IS NOT NULL THEN
    RAISE EXCEPTION 'holm_initial_proof:paused_start_not_rejected:%', v_rejected;
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_continuation_game_id, 'Codex rollback proof - Holm continuation',
    'in_progress', 'holm-game', v_continuation_dealer_game_id,
    v_users[1], 1, false, 1, 0, false
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES (
    v_continuation_game_id, v_users[1], 1, 100,
    'active', false, 'ante_up', false
  );

  SELECT public.start_holm_initial_hand(
    v_continuation_game_id,
    false
  ) INTO v_rejected;
  IF v_rejected->>'outcome' <> 'rejected'
     OR v_rejected->>'reason' <> 'wrong-status'
     OR EXISTS (
       SELECT 1 FROM public.rounds WHERE game_id = v_continuation_game_id
     ) THEN
    RAISE EXCEPTION 'holm_initial_proof:continuation_not_rejected:%', v_rejected;
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money,
    last_round_result
  ) VALUES (
    v_terminal_game_id, 'Codex rollback proof - Holm terminal',
    'game_over', 'holm-game', v_terminal_dealer_game_id,
    v_users[1], 1, false, 1, 0, false, 'Winner proof'
  );
  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out,
    ante_decision, is_bot
  ) VALUES (
    v_terminal_game_id, v_users[1], 1, 100,
    'active', false, 'ante_up', false
  );

  SELECT public.start_holm_initial_hand(v_terminal_game_id, false) INTO v_rejected;
  IF v_rejected->>'outcome' <> 'rejected'
     OR v_rejected->>'reason' <> 'wrong-status' THEN
    RAISE EXCEPTION 'holm_initial_proof:winner_terminal_not_rejected:%', v_rejected;
  END IF;

  UPDATE public.games
     SET status = 'session_ended',
         last_round_result = 'Tie proof'
   WHERE id = v_terminal_game_id;
  SELECT public.start_holm_initial_hand(v_terminal_game_id, false) INTO v_rejected;
  IF v_rejected->>'outcome' <> 'rejected'
     OR v_rejected->>'reason' <> 'wrong-status' THEN
    RAISE EXCEPTION 'holm_initial_proof:tie_terminal_not_rejected:%', v_rejected;
  END IF;

  SELECT public.start_holm_initial_hand(v_terminal_game_id, true) INTO v_rejected;
  IF v_rejected->>'outcome' <> 'rejected'
     OR v_rejected->>'reason' <> 'legacy-recovery-not-supported' THEN
    RAISE EXCEPTION 'holm_initial_proof:legacy_recovery_not_rejected:%', v_rejected;
  END IF;

  RAISE NOTICE 'holm_initial_proof:passed';
END;
$proof$;

ROLLBACK;
