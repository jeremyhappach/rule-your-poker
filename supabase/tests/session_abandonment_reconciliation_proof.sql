-- Rollback-only proof for post-game waiting presence and session resolution.
-- Requires two profiles as FK parents; it writes no persistent rows.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_usernames text[];
  v_winner_game_id uuid := gen_random_uuid();
  v_winner_dealer_game_id uuid := gen_random_uuid();
  v_winner_player_one_id uuid := gen_random_uuid();
  v_winner_player_two_id uuid := gen_random_uuid();
  v_tie_game_id uuid := gen_random_uuid();
  v_tie_dealer_game_id uuid := gen_random_uuid();
  v_tie_player_one_id uuid := gen_random_uuid();
  v_tie_player_two_id uuid := gen_random_uuid();
  v_connected_game_id uuid := gen_random_uuid();
  v_connected_dealer_game_id uuid := gen_random_uuid();
  v_connected_player_one_id uuid := gen_random_uuid();
  v_connected_player_two_id uuid := gen_random_uuid();
  v_initial_waiting_game_id uuid := gen_random_uuid();
  v_initial_waiting_player_id uuid := gen_random_uuid();
  v_in_progress_game_id uuid := gen_random_uuid();
  v_armed_at timestamptz;
  v_outcome text;
  v_public_outcome text;
  v_count integer;
  v_sum integer;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id),
         array_agg(username ORDER BY created_at, id)
    INTO v_users, v_usernames
    FROM (
      SELECT id, username, created_at
        FROM public.profiles
       ORDER BY created_at, id
       LIMIT 2
    ) available_users;

  IF COALESCE(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'session_abandonment_proof:requires_two_profiles';
  END IF;

  IF has_schema_privilege('authenticated', 'private', 'USAGE')
     OR has_schema_privilege('anon', 'private', 'USAGE')
     OR has_function_privilege(
       'authenticated',
       'private.reconcile_session_abandonment(uuid,timestamp with time zone)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'private.reconcile_session_abandonment(uuid,timestamp with time zone)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.resolve_postgame_participation(uuid)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.resolve_postgame_participation(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:authorization-shape';
  END IF;

  SELECT count(*) INTO v_count
    FROM cron.job
   WHERE jobname = 'reconcile-abandoned-real-money-sessions'
     AND active = true
     AND schedule = '30 seconds'
     AND command = 'SELECT private.reconcile_abandoned_sessions();';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'session_abandonment_proof:cron-shape:%', v_count;
  END IF;

  SELECT (public.resolve_postgame_participation(gen_random_uuid())->>'outcome')
    INTO v_public_outcome;
  IF v_public_outcome <> 'not-authorized' THEN
    RAISE EXCEPTION 'session_abandonment_proof:public-authorization:%',
      v_public_outcome;
  END IF;

  -- Winner: one remaining human returns to post-game waiting. A pre-wait
  -- absence is ignored until the waiting lease reaches 15 seconds, then the
  -- finalizer closes once and preserves net-zero SessionResult financials.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_winner_game_id, 'Codex rollback proof - post-game winner',
    'game_selection', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_winner_player_one_id, v_winner_game_id, v_users[1], 3, -3, 'folded', false, false),
    (v_winner_player_two_id, v_winner_game_id, v_users[2], 7, 3, 'active', true, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_winner_dealer_game_id, v_winner_game_id, v_users[1], 'three-five-seven');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_winner_game_id, v_winner_dealer_game_id, 'three-five-seven', 1, 6,
    v_winner_player_two_id, v_usernames[2],
    jsonb_build_object(
      v_winner_player_one_id::text, -3,
      v_winner_player_two_id::text, 3
    )
  );
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id,
    user_id, username, chips, is_bot
  ) VALUES
    (v_winner_game_id, v_winner_dealer_game_id, 1, v_winner_player_one_id,
     v_users[1], v_usernames[1], -3, false),
    (v_winner_game_id, v_winner_dealer_game_id, 1, v_winner_player_two_id,
     v_users[2], v_usernames[2], 3, false);

  SELECT private.resolve_postgame_participation(v_winner_game_id)
    INTO v_outcome;
  IF v_outcome <> 'waiting-active-humans:1'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_winner_game_id AND status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:continuation:%', v_outcome;
  END IF;

  SELECT armed_at INTO v_armed_at
    FROM private.session_abandonment_watches
   WHERE game_id = v_winner_game_id;
  IF v_armed_at IS NULL THEN
    RAISE EXCEPTION 'session_abandonment_proof:postgame-wait-not-armed';
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '14 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'active-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:pre-lease-absence:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '15 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'session-ended-with-results'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id AND sitting_out = true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_winner_game_id AND status = 'session_ended'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:winner-terminal:%', v_outcome;
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0)
    INTO v_count, v_sum
    FROM public.player_transactions
   WHERE source_game_id = v_winner_game_id
     AND transaction_type = 'SessionResult';
  IF v_count <> 2 OR v_sum <> 0 THEN
    RAISE EXCEPTION 'session_abandonment_proof:winner-financials:%,%',
      v_count, v_sum;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '1 hour'
  ) INTO v_outcome;
  SELECT count(*) INTO v_count
    FROM public.player_transactions
   WHERE source_game_id = v_winner_game_id
     AND transaction_type = 'SessionResult';
  IF v_outcome <> 'ineligible-state' OR v_count <> 2 THEN
    RAISE EXCEPTION 'session_abandonment_proof:duplicate-replay:%:%',
      v_outcome, v_count;
  END IF;

  SELECT private.finalize_settled_session_if_no_active_humans(
    v_winner_game_id,
    v_armed_at + interval '1 day'
  ) INTO v_outcome;
  IF v_outcome <> 'already-session-ended' THEN
    RAISE EXCEPTION 'session_abandonment_proof:late-replay:%', v_outcome;
  END IF;

  -- Tie: a zero-delta/chopped result still has durable history and closes
  -- exactly once when every human is explicitly Sitting Out.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_tie_game_id, 'Codex rollback proof - post-game tie',
    'game_selection', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_tie_player_one_id, v_tie_game_id, v_users[1], 3, 0, 'active', true, false),
    (v_tie_player_two_id, v_tie_game_id, v_users[2], 7, 0, 'active', true, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_tie_dealer_game_id, v_tie_game_id, v_users[1], 'yahtzee');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes, is_chopped
  ) VALUES (
    v_tie_game_id, v_tie_dealer_game_id, 'yahtzee', 1, 0,
    NULL, NULL,
    jsonb_build_object(
      v_tie_player_one_id::text, 0,
      v_tie_player_two_id::text, 0
    ), true
  );
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id,
    user_id, username, chips, is_bot
  ) VALUES
    (v_tie_game_id, v_tie_dealer_game_id, 1, v_tie_player_one_id,
     v_users[1], v_usernames[1], 0, false),
    (v_tie_game_id, v_tie_dealer_game_id, 1, v_tie_player_two_id,
     v_users[2], v_usernames[2], 0, false);

  SELECT private.resolve_postgame_participation(v_tie_game_id)
    INTO v_outcome;
  IF v_outcome <> 'session-ended-with-results'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_tie_game_id AND status = 'session_ended'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:tie-terminal:%', v_outcome;
  END IF;

  -- A heartbeat received after the post-game boundary keeps the remaining
  -- player active even after the 15-second absence threshold.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_connected_game_id, 'Codex rollback proof - post-game heartbeat',
    'game_selection', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_connected_player_one_id, v_connected_game_id, v_users[1], 3, 0, 'active', false, false),
    (v_connected_player_two_id, v_connected_game_id, v_users[2], 7, 0, 'active', true, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_connected_dealer_game_id, v_connected_game_id, v_users[1], 'gin-rummy');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_connected_game_id, v_connected_dealer_game_id, 'gin-rummy', 1, 0,
    v_connected_player_one_id, v_usernames[1],
    jsonb_build_object(
      v_connected_player_one_id::text, 0,
      v_connected_player_two_id::text, 0
    )
  );
  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id,
    user_id, username, chips, is_bot
  ) VALUES
    (v_connected_game_id, v_connected_dealer_game_id, 1, v_connected_player_one_id,
     v_users[1], v_usernames[1], 0, false),
    (v_connected_game_id, v_connected_dealer_game_id, 1, v_connected_player_two_id,
     v_users[2], v_usernames[2], 0, false);
  PERFORM private.resolve_postgame_participation(v_connected_game_id);
  UPDATE private.session_abandonment_watches
     SET armed_at = clock_timestamp() - interval '1 hour'
   WHERE game_id = v_connected_game_id;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, route, status, last_heartbeat_at
  ) VALUES (
    v_users[1], 'codex-postgame-heartbeat', v_connected_game_id,
    '/game/' || v_connected_game_id::text, 'active', clock_timestamp()
  );
  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    clock_timestamp() + interval '5 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'active-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_connected_player_one_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:post-boundary-heartbeat:%',
      v_outcome;
  END IF;

  -- Initial waiting and active dealer games are never presence-reconciled.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_initial_waiting_game_id, 'Codex rollback proof - initial waiting',
    'waiting', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES (
    v_initial_waiting_player_id, v_initial_waiting_game_id, v_users[1],
    1, 0, 'active', false, false
  );
  SELECT private.reconcile_session_abandonment(
    v_initial_waiting_game_id,
    clock_timestamp() + interval '1 day'
  ) INTO v_outcome;
  IF v_outcome <> 'ineligible-state'
     OR EXISTS (
       SELECT 1 FROM private.session_abandonment_watches
        WHERE game_id = v_initial_waiting_game_id
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:initial-waiting-touched:%',
      v_outcome;
  END IF;

  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_in_progress_game_id, 'Codex rollback proof - active dealer game',
    'in_progress', v_users[1], 1, 0, true
  );
  INSERT INTO private.session_abandonment_watches (game_id)
  VALUES (v_in_progress_game_id);
  SELECT private.reconcile_session_abandonment(
    v_in_progress_game_id,
    clock_timestamp() + interval '1 day'
  ) INTO v_outcome;
  IF v_outcome <> 'ineligible-state'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_in_progress_game_id AND status = 'in_progress'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:active-game-advanced:%',
      v_outcome;
  END IF;

  RAISE NOTICE 'session_abandonment_proof:passed';
END;
$proof$;

ROLLBACK;
