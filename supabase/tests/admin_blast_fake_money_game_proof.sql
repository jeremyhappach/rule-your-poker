-- Rollback-only proof for an admin's single-session fake-money blast.
-- Requires two profiles and one admin role. It leaves no persistent rows.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_usernames text[];
  v_admin_user_id uuid;
  v_unauthorized_user_id uuid := gen_random_uuid();
  v_winner_game_id uuid := gen_random_uuid();
  v_winner_dealer_game_id uuid := gen_random_uuid();
  v_winner_round_id uuid := gen_random_uuid();
  v_winner_player_one_id uuid := gen_random_uuid();
  v_winner_player_two_id uuid := gen_random_uuid();
  v_tie_game_id uuid := gen_random_uuid();
  v_tie_dealer_game_id uuid := gen_random_uuid();
  v_tie_round_id uuid := gen_random_uuid();
  v_tie_player_one_id uuid := gen_random_uuid();
  v_tie_player_two_id uuid := gen_random_uuid();
  v_real_game_id uuid := gen_random_uuid();
  v_control_game_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id),
         array_agg(username ORDER BY created_at, id)
    INTO v_users, v_usernames
    FROM (
      SELECT id, username, created_at
        FROM public.profiles
       ORDER BY created_at, id
       LIMIT 2
    ) AS available_users;

  SELECT user_id
    INTO v_admin_user_id
    FROM public.user_roles
   WHERE role = 'admin'
   ORDER BY created_at, id
   LIMIT 1;

  IF COALESCE(cardinality(v_users), 0) < 2 OR v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:requires_two_profiles_and_an_admin';
  END IF;

  IF has_function_privilege('anon', 'public.admin_blast_fake_money_game(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.admin_blast_fake_money_game(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.admin_blast_fake_money_game(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:authorization_grants_invalid';
  END IF;

  -- An active winner-result session exercises live continuation state plus all
  -- result artifacts, including the archive without a game foreign key.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_winner_game_id, 'Codex rollback proof - blast winner', 'in_progress',
    v_users[1], 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_winner_player_one_id, v_winner_game_id, v_users[1], 3, -2, 'active', false, false),
    (v_winner_player_two_id, v_winner_game_id, v_users[2], 7, 2, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_winner_dealer_game_id, v_winner_game_id, v_users[1], 'three-five-seven');
  INSERT INTO public.rounds (
    id, game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot
  ) VALUES (
    v_winner_round_id, v_winner_game_id, v_winner_dealer_game_id, 1, 1, 3, 'completed', 0
  );
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_winner_game_id, v_winner_dealer_game_id, 'three-five-seven', 1, 0,
    v_winner_player_two_id, v_usernames[2],
    jsonb_build_object(v_winner_player_one_id::text, -2, v_winner_player_two_id::text, 2)
  );
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id, user_id, username, chips, is_bot
  ) VALUES
    (v_winner_game_id, v_winner_dealer_game_id, 1, v_winner_player_one_id, v_users[1], v_usernames[1], -2, false),
    (v_winner_game_id, v_winner_dealer_game_id, 1, v_winner_player_two_id, v_users[2], v_usernames[2], 2, false);
  INSERT INTO public.cribbage_hand_archive (
    dealer_game_id, hand_number, game_id, round_id, dealer_player_id,
    dealt_hands, hand_counts, cribbage_state
  ) VALUES (
    v_winner_dealer_game_id, 1, v_winner_game_id, v_winner_round_id, v_winner_player_one_id,
    '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
  );

  -- A terminal tie result must be just as removable as a live winner.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money, session_ended_at
  ) VALUES (
    v_tie_game_id, 'Codex rollback proof - blast tie', 'session_ended',
    v_users[1], 1, 0, false, clock_timestamp()
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_tie_player_one_id, v_tie_game_id, v_users[1], 3, 0, 'active', false, false),
    (v_tie_player_two_id, v_tie_game_id, v_users[2], 7, 0, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_tie_dealer_game_id, v_tie_game_id, v_users[1], 'holm');
  INSERT INTO public.rounds (
    id, game_id, dealer_game_id, hand_number, round_number, cards_dealt, status, pot
  ) VALUES (
    v_tie_round_id, v_tie_game_id, v_tie_dealer_game_id, 1, 1, 4, 'completed', 0
  );
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_tie_game_id, v_tie_dealer_game_id, 'holm', 1, 0, null, 'Tie',
    jsonb_build_object(v_tie_player_one_id::text, 0, v_tie_player_two_id::text, 0)
  );
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id, user_id, username, chips, is_bot
  ) VALUES
    (v_tie_game_id, v_tie_dealer_game_id, 1, v_tie_player_one_id, v_users[1], v_usernames[1], 0, false),
    (v_tie_game_id, v_tie_dealer_game_id, 1, v_tie_player_two_id, v_users[2], v_usernames[2], 0, false);

  -- The nearby fake session proves this operation is exact, not a bulk purge.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_control_game_id, 'Codex rollback proof - preserved fake control', 'waiting',
    v_users[1], 1, 0, false
  );
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_real_game_id, 'Codex rollback proof - protected real money', 'in_progress',
    v_users[1], 1, 0, true
  );

  PERFORM set_config('request.jwt.claim.sub', v_unauthorized_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_unauthorized_user_id, 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.admin_blast_fake_money_game(v_winner_game_id);
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:authorization_bypassed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = v_winner_game_id) THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:unauthorized_call_mutated_game';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_admin_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_admin_user_id, 'role', 'authenticated')::text,
    true
  );
  SELECT public.admin_blast_fake_money_game(v_winner_game_id) INTO v_result;
  IF v_result->>'outcome' <> 'deleted'
     OR (v_result->>'deleted')::boolean IS NOT TRUE
     OR EXISTS (SELECT 1 FROM public.games WHERE id = v_winner_game_id)
     OR EXISTS (SELECT 1 FROM public.dealer_games WHERE id = v_winner_dealer_game_id)
     OR EXISTS (SELECT 1 FROM public.rounds WHERE id = v_winner_round_id)
     OR EXISTS (SELECT 1 FROM public.game_results WHERE game_id = v_winner_game_id)
     OR EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = v_winner_game_id)
     OR EXISTS (SELECT 1 FROM public.cribbage_hand_archive WHERE game_id = v_winner_game_id) THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:winner_cleanup_failed:%', v_result;
  END IF;

  SELECT public.admin_blast_fake_money_game(v_winner_game_id) INTO v_result;
  IF v_result->>'outcome' <> 'already-deleted'
     OR (v_result->>'deleted')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:duplicate_or_late_replay_failed:%', v_result;
  END IF;

  SELECT public.admin_blast_fake_money_game(v_tie_game_id) INTO v_result;
  IF v_result->>'outcome' <> 'deleted'
     OR EXISTS (SELECT 1 FROM public.games WHERE id = v_tie_game_id)
     OR EXISTS (SELECT 1 FROM public.game_results WHERE game_id = v_tie_game_id) THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:terminal_tie_cleanup_failed:%', v_result;
  END IF;

  BEGIN
    PERFORM public.admin_blast_fake_money_game(v_real_game_id);
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:real_money_guard_bypassed';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'only fake-money games can be blasted' THEN
      RAISE;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.games WHERE id = v_real_game_id)
     OR NOT EXISTS (SELECT 1 FROM public.games WHERE id = v_control_game_id) THEN
    RAISE EXCEPTION 'admin_blast_fake_money_game_proof:protected_or_control_game_mutated';
  END IF;

  RAISE NOTICE 'admin_blast_fake_money_game_proof:passed';
END;
$proof$;

ROLLBACK;
