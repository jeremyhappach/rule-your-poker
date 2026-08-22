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
  v_heartbeat_at timestamptz;
  v_next_check_at timestamptz;
  v_missed_heartbeat_counts jsonb;
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
   WHERE jobname = 'advance-due-game-state-1s'
     AND active = true
     AND schedule = '1 second'
     AND command = 'SELECT private.advance_due_game_state();';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'session_abandonment_proof:cron-shape:%', v_count;
  END IF;

  SELECT (public.resolve_postgame_participation(gen_random_uuid())->>'outcome')
    INTO v_public_outcome;
  IF v_public_outcome <> 'not-authorized' THEN
    RAISE EXCEPTION 'session_abandonment_proof:public-authorization:%',
      v_public_outcome;
  END IF;

  -- Winner: one remaining human returns to subsequent Waiting. Sixty seconds
  -- without a heartbeat marks that player involuntarily Sitting Out, and the
  -- 15-second forced-absence confirmation then releases the seat and settles.
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
  IF v_outcome <> 'waiting-seated-humans:2;active-humans:1;active-players:1'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_winner_game_id AND status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:continuation:%', v_outcome;
  END IF;

  SELECT armed_at, next_check_at
    INTO v_armed_at, v_next_check_at
    FROM private.session_abandonment_watches
   WHERE game_id = v_winner_game_id;
  IF v_armed_at IS NULL
     OR v_next_check_at <> v_armed_at + interval '5 seconds' THEN
    RAISE EXCEPTION 'session_abandonment_proof:postgame-wait-not-armed';
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '4 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:pre-first-miss:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '5 seconds'
  ) INTO v_outcome;
  SELECT missed_heartbeat_counts
    INTO v_missed_heartbeat_counts
    FROM private.session_abandonment_watches
   WHERE game_id = v_winner_game_id;
  IF v_outcome <> 'seated-humans'
     OR COALESCE((v_missed_heartbeat_counts ->> v_winner_player_one_id::text)::integer, -1) <> 1
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:first-miss:%:%',
      v_outcome, v_missed_heartbeat_counts;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '10 seconds'
  ) INTO v_outcome;
  SELECT missed_heartbeat_counts
    INTO v_missed_heartbeat_counts
    FROM private.session_abandonment_watches
   WHERE game_id = v_winner_game_id;
  IF v_outcome <> 'seated-humans'
     OR COALESCE((v_missed_heartbeat_counts ->> v_winner_player_one_id::text)::integer, -1) <> 2
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:second-miss:%:%',
      v_outcome, v_missed_heartbeat_counts;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '60 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id
          AND sitting_out = true
          AND status <> 'left'
     )
     OR NOT EXISTS (
       SELECT 1 FROM private.postgame_forced_absence_watches
        WHERE game_id = v_winner_game_id
          AND player_id = v_winner_player_one_id
          AND reason = 'presence_timeout'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:winner-demotion:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '74 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id AND status = 'left'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:winner-early-release:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_winner_game_id,
    v_armed_at + interval '75 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'session-ended-with-results'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_winner_player_one_id
          AND sitting_out = true
          AND status = 'left'
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

  -- Tie: voluntary sitters retain their seats while present, then both are
  -- released after 60 seconds without heartbeat and settle exactly once.
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
  IF v_outcome <> 'waiting-seated-humans:2;active-humans:0;active-players:0'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_tie_game_id AND status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:tie-waiting:%', v_outcome;
  END IF;
  SELECT armed_at INTO v_armed_at
    FROM private.session_abandonment_watches
   WHERE game_id = v_tie_game_id;
  SELECT private.reconcile_session_abandonment(
    v_tie_game_id,
    v_armed_at + interval '59 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans' THEN
    RAISE EXCEPTION 'session_abandonment_proof:tie-early-release:%', v_outcome;
  END IF;
  SELECT private.reconcile_session_abandonment(
    v_tie_game_id,
    v_armed_at + interval '60 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'session-ended-with-results'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_tie_game_id AND status = 'session_ended'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:tie-terminal:%', v_outcome;
  END IF;

  -- A post-boundary heartbeat resets a player who already has two missed
  -- windows; only three consecutive server-measured misses may sit them out.
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
  SELECT armed_at
    INTO v_armed_at
    FROM private.session_abandonment_watches
   WHERE game_id = v_connected_game_id;
  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    v_armed_at + interval '10 seconds'
  ) INTO v_outcome;
  SELECT missed_heartbeat_counts
    INTO v_missed_heartbeat_counts
    FROM private.session_abandonment_watches
   WHERE game_id = v_connected_game_id;
  IF v_outcome <> 'seated-humans'
     OR COALESCE((v_missed_heartbeat_counts ->> v_connected_player_one_id::text)::integer, -1) <> 2 THEN
    RAISE EXCEPTION 'session_abandonment_proof:heartbeat-precondition:%:%',
      v_outcome, v_missed_heartbeat_counts;
  END IF;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, route, status, last_heartbeat_at
  ) VALUES (
    v_users[1], 'codex-postgame-heartbeat', v_connected_game_id,
    '/game/' || v_connected_game_id::text, 'active', clock_timestamp()
  );
  SELECT updated_at INTO v_heartbeat_at
    FROM public.voice_presence_heartbeats
   WHERE user_id = v_users[1]
     AND tab_id = 'codex-postgame-heartbeat';
  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    v_heartbeat_at + interval '5 seconds'
  ) INTO v_outcome;
  SELECT missed_heartbeat_counts
    INTO v_missed_heartbeat_counts
    FROM private.session_abandonment_watches
   WHERE game_id = v_connected_game_id;
  IF v_outcome <> 'seated-humans'
     OR COALESCE((v_missed_heartbeat_counts ->> v_connected_player_one_id::text)::integer, 3) >= 3
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_connected_player_one_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:post-boundary-heartbeat:%',
      v_outcome;
  END IF;

  -- Once the active lease expires, a later heartbeat cancels the 15-second
  -- forced stand-up but deliberately leaves the player Sitting Out.
  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    v_heartbeat_at + interval '60 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_connected_player_one_id
          AND status <> 'left'
          AND sitting_out = true
     )
     OR NOT EXISTS (
       SELECT 1 FROM private.postgame_forced_absence_watches
        WHERE game_id = v_connected_game_id
          AND player_id = v_connected_player_one_id
          AND reason = 'presence_timeout'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:presence-demotion:%', v_outcome;
  END IF;

  UPDATE private.postgame_forced_absence_watches
     SET armed_at = clock_timestamp() - interval '1 second'
   WHERE game_id = v_connected_game_id
     AND player_id = v_connected_player_one_id;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, route, status, last_heartbeat_at
  ) VALUES (
    v_users[1], 'codex-post-demotion-' || v_connected_game_id::text,
    v_connected_game_id, '/game/' || v_connected_game_id::text, 'active',
    clock_timestamp()
  );
  SELECT updated_at INTO v_heartbeat_at
    FROM public.voice_presence_heartbeats
   WHERE user_id = v_users[1]
     AND tab_id = 'codex-post-demotion-' || v_connected_game_id::text;
  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    v_heartbeat_at + interval '14 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_connected_player_one_id
          AND status <> 'left'
          AND sitting_out = true
     )
     OR EXISTS (
       SELECT 1 FROM private.postgame_forced_absence_watches
        WHERE game_id = v_connected_game_id
          AND player_id = v_connected_player_one_id
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:heartbeat-cancelled-release:%',
      v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    v_heartbeat_at + interval '59 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans' THEN
    RAISE EXCEPTION 'session_abandonment_proof:recovered-sitter-early-release:%',
      v_outcome;
  END IF;
  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    v_heartbeat_at + interval '60 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'session-ended-with-results' THEN
    RAISE EXCEPTION 'session_abandonment_proof:recovered-sitter-release:%',
      v_outcome;
  END IF;

  -- Initial Waiting is armed only after the first seated human appears and a
  -- pristine abandoned session is deleted after the five-minute lease.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_initial_waiting_game_id, 'Codex rollback proof - initial waiting',
    'waiting', v_users[1], 1, 0, true
  );
  IF EXISTS (
    SELECT 1 FROM private.session_abandonment_watches
     WHERE game_id = v_initial_waiting_game_id
  ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:bare-game-armed-before-player';
  END IF;
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES (
    v_initial_waiting_player_id, v_initial_waiting_game_id, v_users[1],
    1, 0, 'active', false, false
  );
  SELECT armed_at INTO v_armed_at
    FROM private.session_abandonment_watches
   WHERE game_id = v_initial_waiting_game_id
     AND waiting_kind = 'initial';
  SELECT private.reconcile_session_abandonment(
    v_initial_waiting_game_id,
    v_armed_at + interval '299 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'seated-humans'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_initial_waiting_player_id AND status <> 'left'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:initial-waiting-early-release:%',
      v_outcome;
  END IF;
  SELECT private.reconcile_session_abandonment(
    v_initial_waiting_game_id,
    v_armed_at + interval '300 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'deleted-pristine-initial-session'
     OR EXISTS (
       SELECT 1 FROM public.games WHERE id = v_initial_waiting_game_id
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:initial-waiting-not-deleted:%',
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
