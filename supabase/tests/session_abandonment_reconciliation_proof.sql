-- Rollback-only proof for authoritative real-money abandonment reconciliation.
-- Requires two existing profiles only as FK parents; no persisted rows survive.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_usernames text[];
  v_result_game_id uuid := gen_random_uuid();
  v_result_dealer_game_id uuid := gen_random_uuid();
  v_result_player_one_id uuid := gen_random_uuid();
  v_result_player_two_id uuid := gen_random_uuid();
  v_connected_game_id uuid := gen_random_uuid();
  v_connected_player_id uuid := gen_random_uuid();
  v_pristine_game_id uuid := gen_random_uuid();
  v_pristine_player_id uuid := gen_random_uuid();
  v_blocked_game_id uuid := gen_random_uuid();
  v_blocked_dealer_game_id uuid := gen_random_uuid();
  v_blocked_player_id uuid := gen_random_uuid();
  v_in_progress_game_id uuid := gen_random_uuid();
  v_historical_game_id uuid := gen_random_uuid();
  v_fake_game_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_future timestamptz;
  v_outcome text;
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
     OR has_schema_privilege('anon', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'session_abandonment_proof:private_schema_exposed';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'private.reconcile_session_abandonment(uuid,timestamp with time zone)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'private.reconcile_session_abandonment(uuid,timestamp with time zone)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:internal_reconciler_exposed';
  END IF;

  SELECT count(*) INTO v_count
    FROM cron.job
   WHERE jobname = 'reconcile-abandoned-real-money-sessions'
     AND active = true
     AND schedule = '10 seconds'
     AND command = 'SELECT private.reconcile_abandoned_sessions();';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'session_abandonment_proof:cron_shape:%', v_count;
  END IF;

  -- Settled real-money history: stale humans are sat out, closure requires a
  -- second observation, and SessionResult rows are minted once from snapshots.
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    ante_amount, pot, real_money
  ) VALUES (
    v_result_game_id, 'Codex rollback proof - settled abandonment',
    'waiting', 'three-five-seven', v_result_dealer_game_id, v_users[1],
    1, 0, true
  );

  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_result_player_one_id, v_result_game_id, v_users[1], 3, -3, 'folded', false, false),
    (v_result_player_two_id, v_result_game_id, v_users[2], 7, 3, 'active', true, false);

  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_result_dealer_game_id, v_result_game_id, v_users[1], 'three-five-seven'
  );

  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_result_game_id, v_result_dealer_game_id, 'three-five-seven', 1, 6,
    v_result_player_two_id, v_usernames[2],
    jsonb_build_object(
      v_result_player_one_id::text, -3,
      v_result_player_two_id::text, 3
    )
  );

  INSERT INTO public.session_player_snapshots (
    game_id, dealer_game_id, hand_number, player_id,
    user_id, username, chips, is_bot
  ) VALUES
    (
      v_result_game_id, v_result_dealer_game_id, 1,
      v_result_player_one_id, v_users[1], v_usernames[1], -3, false
    ),
    (
      v_result_game_id, v_result_dealer_game_id, 1,
      v_result_player_two_id, v_users[2], v_usernames[2], 3, false
    );

  v_future := v_now + interval '1 hour';
  SELECT private.reconcile_session_abandonment(v_result_game_id, v_future)
    INTO v_outcome;
  IF v_outcome <> 'zero-active-unconfirmed'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_result_player_one_id AND sitting_out = true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_result_game_id AND status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:first_confirmation:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_result_game_id,
    v_future + interval '5 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'zero-active-unconfirmed' THEN
    RAISE EXCEPTION 'session_abandonment_proof:early_close:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_result_game_id,
    v_future + interval '11 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'session-ended-with-results'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_result_game_id AND status = 'session_ended'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:settled_close:%', v_outcome;
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0)
    INTO v_count, v_sum
    FROM public.player_transactions
   WHERE source_game_id = v_result_game_id
     AND transaction_type = 'SessionResult';
  IF v_count <> 2 OR v_sum <> 0 THEN
    RAISE EXCEPTION 'session_abandonment_proof:financials:count=%,sum=%',
      v_count, v_sum;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_result_game_id,
    v_future + interval '12 seconds'
  ) INTO v_outcome;
  SELECT count(*) INTO v_count
    FROM public.player_transactions
   WHERE source_game_id = v_result_game_id
     AND transaction_type = 'SessionResult';
  IF v_outcome <> 'ineligible-state' OR v_count <> 2 THEN
    RAISE EXCEPTION 'session_abandonment_proof:replay_not_idempotent:%,%',
      v_outcome, v_count;
  END IF;

  -- A fresh server-stamped lease keeps its human active.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_connected_game_id, 'Codex rollback proof - connected guard',
    'waiting', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES (
    v_connected_player_id, v_connected_game_id, v_users[1],
    1, 0, 'active', false, false
  );
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, route, status,
    last_heartbeat_at, updated_at
  ) VALUES (
    v_users[1], 'codex-connected-proof', v_connected_game_id,
    '/game/' || v_connected_game_id::text, 'active',
    v_now + interval '1 day', v_now + interval '1 day'
  );

  IF EXISTS (
    SELECT 1 FROM public.voice_presence_heartbeats
     WHERE user_id = v_users[1]
       AND tab_id = 'codex-connected-proof'
       AND updated_at > clock_timestamp() + interval '1 minute'
  ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:server_timestamp_not_enforced';
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_connected_game_id,
    clock_timestamp()
  ) INTO v_outcome;
  IF v_outcome <> 'active-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_connected_player_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:fresh_lease_not_honored:%', v_outcome;
  END IF;

  -- A pristine room is retained through the long grace and then deleted.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_pristine_game_id, 'Codex rollback proof - pristine deletion',
    'waiting', v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES (
    v_pristine_player_id, v_pristine_game_id, v_users[1],
    1, 0, 'active', false, false
  );

  SELECT private.reconcile_session_abandonment(
    v_pristine_game_id,
    v_future
  ) INTO v_outcome;
  IF v_outcome <> 'zero-active-unconfirmed' THEN
    RAISE EXCEPTION 'session_abandonment_proof:pristine_first_check:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_pristine_game_id,
    v_future + interval '11 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'pristine-session-grace'
     OR NOT EXISTS (SELECT 1 FROM public.games WHERE id = v_pristine_game_id) THEN
    RAISE EXCEPTION 'session_abandonment_proof:pristine_grace:%', v_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_pristine_game_id,
    v_future + interval '16 minutes'
  ) INTO v_outcome;
  IF v_outcome <> 'deleted-pristine-session'
     OR EXISTS (SELECT 1 FROM public.games WHERE id = v_pristine_game_id)
     OR EXISTS (SELECT 1 FROM public.players WHERE game_id = v_pristine_game_id)
     OR EXISTS (
       SELECT 1 FROM private.session_abandonment_watches
        WHERE game_id = v_pristine_game_id
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:pristine_delete:%', v_outcome;
  END IF;

  -- History without a settled result/snapshot batch is preserved for recovery.
  INSERT INTO public.games (
    id, name, status, current_game_uuid, current_host,
    ante_amount, pot, real_money
  ) VALUES (
    v_blocked_game_id, 'Codex rollback proof - unsettled history',
    'waiting', v_blocked_dealer_game_id, v_users[1], 1, 0, true
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES (
    v_blocked_player_id, v_blocked_game_id, v_users[1],
    1, 0, 'active', false, false
  );
  INSERT INTO public.dealer_games (
    id, session_id, dealer_user_id, game_type
  ) VALUES (
    v_blocked_dealer_game_id, v_blocked_game_id, v_users[1], 'holm'
  );

  PERFORM private.reconcile_session_abandonment(v_blocked_game_id, v_future);
  SELECT private.reconcile_session_abandonment(
    v_blocked_game_id,
    v_future + interval '11 seconds'
  ) INTO v_outcome;
  IF v_outcome <> 'blocked-unsettled-history'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_blocked_game_id AND status = 'waiting'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:unsettled_history_not_preserved:%',
      v_outcome;
  END IF;

  -- Generic abandonment handling never advances an in-progress game.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_in_progress_game_id, 'Codex rollback proof - in progress',
    'in_progress', v_users[1], 1, 0, true
  );
  INSERT INTO private.session_abandonment_watches (game_id)
  VALUES (v_in_progress_game_id);
  SELECT private.reconcile_session_abandonment(
    v_in_progress_game_id,
    v_future
  ) INTO v_outcome;
  IF v_outcome <> 'ineligible-state'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_in_progress_game_id AND status = 'in_progress'
     ) THEN
    RAISE EXCEPTION 'session_abandonment_proof:in_progress_was_advanced:%', v_outcome;
  END IF;

  -- Existing sessions are not swept merely because the migration was applied.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_historical_game_id, 'Codex rollback proof - historical unarmed',
    'waiting', v_users[1], 1, 0, true
  );
  DELETE FROM private.session_abandonment_watches
   WHERE game_id = v_historical_game_id;
  SELECT private.reconcile_session_abandonment(
    v_historical_game_id,
    v_future
  ) INTO v_outcome;
  IF v_outcome <> 'unarmed'
     OR NOT EXISTS (SELECT 1 FROM public.games WHERE id = v_historical_game_id) THEN
    RAISE EXCEPTION 'session_abandonment_proof:historical_session_swept:%', v_outcome;
  END IF;

  -- Fake-money lifecycle remains outside this real-money-only policy.
  INSERT INTO public.games (
    id, name, status, current_host, ante_amount, pot, real_money
  ) VALUES (
    v_fake_game_id, 'Codex rollback proof - fake money',
    'waiting', v_users[1], 1, 0, false
  );
  INSERT INTO private.session_abandonment_watches (game_id)
  VALUES (v_fake_game_id);
  SELECT private.reconcile_session_abandonment(v_fake_game_id, v_future)
    INTO v_outcome;
  IF v_outcome <> 'ineligible-state'
     OR NOT EXISTS (SELECT 1 FROM public.games WHERE id = v_fake_game_id) THEN
    RAISE EXCEPTION 'session_abandonment_proof:fake_money_touched:%', v_outcome;
  END IF;

  RAISE NOTICE 'session_abandonment_proof:passed';
END;
$proof$;

ROLLBACK;
