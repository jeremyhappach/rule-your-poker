-- Rollback-only proof for database-owned multi-player Holm showdown resolution.
-- Verifies that the final authenticated stay action resolves H1 and creates
-- exactly one non-actionable H2 when the dealer game continues.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_player_one_id uuid;
  v_player_two_id uuid;
  v_round_id uuid;
  v_result jsonb;
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
    RAISE EXCEPTION 'holm_database_resolution_proof:requires_two_profiles';
  END IF;

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm database resolution',
    'ante_decision', 'holm-game', v_dealer_game_id, v_users[1],
    2, true, 1, 0, false
  );

  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'holm');

  INSERT INTO public.players (
    game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot
  ) VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', false);

  SELECT id INTO v_player_one_id
    FROM public.players
   WHERE game_id = v_game_id AND position = 1;
  SELECT id INTO v_player_two_id
    FROM public.players
   WHERE game_id = v_game_id AND position = 2;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text,
    true
  );

  SELECT public.start_holm_initial_hand(v_game_id, false) INTO v_result;
  v_round_id := (v_result->>'round_id')::uuid;

  SELECT public.holm_submit_decision(
    v_game_id, v_round_id, v_player_one_id, 'stay'
  ) INTO v_result;
  IF coalesce((v_result->>'all_decisions_in')::boolean, true)
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'betting' THEN
    RAISE EXCEPTION 'holm_database_resolution_proof:first_decision_invalid:%', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[2]::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_users[2], 'role', 'authenticated')::text,
    true
  );

  SELECT public.holm_submit_decision(
    v_game_id, v_round_id, v_player_two_id, 'stay'
  ) INTO v_result;

  IF (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'completed'
     OR (SELECT community_cards_revealed FROM public.rounds WHERE id = v_round_id) <> 4
     OR (SELECT all_decisions_in FROM public.games WHERE id = v_game_id) IS DISTINCT FROM true
     OR EXISTS (
       SELECT 1
         FROM public.players
        WHERE game_id = v_game_id
          AND decision_locked IS NOT TRUE
     )
     OR NOT EXISTS (
       SELECT 1
         FROM public.game_results
        WHERE game_id = v_game_id
          AND dealer_game_id = v_dealer_game_id
          AND hand_number = 1
     ) THEN
    RAISE EXCEPTION 'holm_database_resolution_proof:final_decision_did_not_resolve:%', v_result;
  END IF;

  -- This database uses `dealing` for the created, non-actionable successor;
  -- some older installations use `prepared`. Both are intentionally accepted.
  IF (SELECT status FROM public.games WHERE id = v_game_id) = 'in_progress'
     AND (
       (SELECT awaiting_next_round FROM public.games WHERE id = v_game_id) IS DISTINCT FROM true
       OR (SELECT count(*) FROM public.rounds
            WHERE game_id = v_game_id
              AND hand_number = 2
              AND status IN ('prepared', 'dealing')) <> 1
     ) THEN
    RAISE EXCEPTION 'holm_database_resolution_proof:continuation_not_created:%', v_result;
  END IF;

  RAISE NOTICE 'holm_database_resolution_proof:passed';
END;
$proof$;

ROLLBACK;
