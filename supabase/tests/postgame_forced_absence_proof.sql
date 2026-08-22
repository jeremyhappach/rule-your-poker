-- Rollback-only proof for forced config-timeout eviction and hidden-tab grace.
-- It uses existing profiles only as FK parents and leaves no persistent rows.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_usernames text[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_absent_player_id uuid := gen_random_uuid();
  v_survivor_player_id uuid := gen_random_uuid();
  v_present_game_id uuid := gen_random_uuid();
  v_present_dealer_game_id uuid := gen_random_uuid();
  v_present_player_id uuid := gen_random_uuid();
  v_present_survivor_id uuid := gen_random_uuid();
  v_deadline timestamptz := clock_timestamp() - interval '1 second';
  v_present_deadline timestamptz := clock_timestamp() - interval '1 second';
  v_forced_armed_at timestamptz;
  v_hidden_seen_at timestamptz;
  v_outcome jsonb;
  v_reconcile_outcome text;
  v_count integer;
BEGIN
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

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
    RAISE EXCEPTION 'postgame_forced_absence_proof:requires_two_profiles';
  END IF;

  IF has_schema_privilege('authenticated', 'private', 'USAGE')
     OR has_table_privilege(
       'authenticated',
       'private.postgame_forced_absence_watches',
       'SELECT'
     )
     OR has_table_privilege(
       'anon',
       'private.postgame_forced_absence_watches',
       'SELECT'
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:authorization-shape';
  END IF;

  SELECT CASE
           WHEN value ->> 'hidden_grace_seconds' ~ '^[0-9]+$'
             THEN (value ->> 'hidden_grace_seconds')::integer
           ELSE NULL
         END
    INTO v_count
    FROM public.system_settings
   WHERE key = 'postgame_presence';
  IF v_count NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:hidden-grace:%', v_count;
  END IF;

  INSERT INTO public.games (
    id, name, status, current_host, game_type, dealer_position,
    config_deadline, config_complete, game_setup_timer_seconds,
    ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - forced config absence',
    'game_selection', v_users[1], '3-5-7', 3,
    v_deadline, false, 60, 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_absent_player_id, v_game_id, v_users[1], 3, 0, 'active', false, false),
    (v_survivor_player_id, v_game_id, v_users[2], 7, 0, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'three-five-seven');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_game_id, v_dealer_game_id, 'three-five-seven', 1, 0,
    v_absent_player_id, v_usernames[1],
    jsonb_build_object(v_absent_player_id::text, 0, v_survivor_player_id::text, 0)
  );

  SELECT private.handle_config_deadline_timeout_exact(v_game_id, v_deadline, 3)
    INTO v_outcome;
  IF v_outcome ->> 'outcome' <> 'waiting'
     OR NOT EXISTS (
       SELECT 1 FROM public.games
        WHERE id = v_game_id AND status = 'waiting'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_absent_player_id
          AND sitting_out = true
          AND status = 'active'
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:config-timeout:%', v_outcome;
  END IF;

  SELECT armed_at INTO v_forced_armed_at
    FROM private.postgame_forced_absence_watches
   WHERE game_id = v_game_id
     AND player_id = v_absent_player_id;
  IF v_forced_armed_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM private.session_abandonment_watches
        WHERE game_id = v_game_id
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:watch-not-armed';
  END IF;

  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, route, status, last_heartbeat_at
  ) VALUES (
    v_users[2], 'codex-survivor-' || v_game_id::text, v_game_id,
    '/game/' || v_game_id::text, 'active', clock_timestamp()
  );

  SELECT private.reconcile_session_abandonment(
    v_game_id,
    v_forced_armed_at + interval '14 seconds'
  ) INTO v_reconcile_outcome;
  IF v_reconcile_outcome <> 'active-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_absent_player_id AND status = 'left'
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:early-stand-up:%',
      v_reconcile_outcome;
  END IF;

  SELECT private.reconcile_session_abandonment(
    v_game_id,
    v_forced_armed_at + interval '15 seconds'
  ) INTO v_reconcile_outcome;
  IF v_reconcile_outcome <> 'active-humans'
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_absent_player_id
          AND status = 'left'
          AND sitting_out = true
     )
     OR EXISTS (
       SELECT 1 FROM private.postgame_forced_absence_watches
        WHERE game_id = v_game_id AND player_id = v_absent_player_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_survivor_player_id
          AND status = 'active'
          AND sitting_out = false
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:stand-up:%',
      v_reconcile_outcome;
  END IF;

  -- The survivor may be backgrounded without being treated as departed after
  -- only 15 seconds. The system setting deliberately grants five minutes.
  UPDATE public.voice_presence_heartbeats
     SET status = 'hidden',
         last_heartbeat_at = clock_timestamp()
   WHERE user_id = v_users[2]
     AND tab_id = 'codex-survivor-' || v_game_id::text;
  SELECT updated_at INTO v_hidden_seen_at
    FROM public.voice_presence_heartbeats
   WHERE user_id = v_users[2]
     AND tab_id = 'codex-survivor-' || v_game_id::text;
  SELECT private.reconcile_session_abandonment(
    v_game_id,
    v_hidden_seen_at + interval '60 seconds'
  ) INTO v_reconcile_outcome;
  IF v_reconcile_outcome <> 'active-humans'
     OR EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_survivor_player_id AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:hidden-tab-expired:%',
      v_reconcile_outcome;
  END IF;

  -- A timed-out setup owner who does heartbeat after expiry is present. Their
  -- forced watch clears, but ordinary red Sitting Out seat retention remains.
  INSERT INTO public.games (
    id, name, status, current_host, game_type, dealer_position,
    config_deadline, config_complete, game_setup_timer_seconds,
    ante_amount, pot, real_money
  ) VALUES (
    v_present_game_id, 'Codex rollback proof - present config timeout',
    'game_selection', v_users[1], '3-5-7', 3,
    v_present_deadline, false, 60, 1, 0, false
  );
  INSERT INTO public.players (
    id, game_id, user_id, position, chips, status, sitting_out, is_bot
  ) VALUES
    (v_present_player_id, v_present_game_id, v_users[1], 3, 0, 'active', false, false),
    (v_present_survivor_id, v_present_game_id, v_users[2], 7, 0, 'active', false, false);
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_present_dealer_game_id, v_present_game_id, v_users[1], 'three-five-seven');
  INSERT INTO public.game_results (
    game_id, dealer_game_id, game_type, hand_number, pot_won,
    winner_player_id, winner_username, player_chip_changes
  ) VALUES (
    v_present_game_id, v_present_dealer_game_id, 'three-five-seven', 1, 0,
    v_present_player_id, v_usernames[1],
    jsonb_build_object(v_present_player_id::text, 0, v_present_survivor_id::text, 0)
  );

  PERFORM private.handle_config_deadline_timeout_exact(
    v_present_game_id,
    v_present_deadline,
    3
  );
  SELECT armed_at INTO v_forced_armed_at
    FROM private.postgame_forced_absence_watches
   WHERE game_id = v_present_game_id
     AND player_id = v_present_player_id;
  INSERT INTO public.voice_presence_heartbeats (
    user_id, tab_id, game_id, route, status, last_heartbeat_at
  ) VALUES
  (
    v_users[1], 'codex-present-' || v_present_game_id::text,
    v_present_game_id, '/game/' || v_present_game_id::text,
    'active', clock_timestamp()
  ),
  (
    v_users[2], 'codex-present-survivor-' || v_present_game_id::text,
    v_present_game_id, '/game/' || v_present_game_id::text,
    'active', clock_timestamp()
  );
  SELECT private.reconcile_session_abandonment(
    v_present_game_id,
    v_forced_armed_at + interval '15 seconds'
  ) INTO v_reconcile_outcome;
  IF v_reconcile_outcome <> 'active-humans'
     OR EXISTS (
       SELECT 1 FROM private.postgame_forced_absence_watches
        WHERE game_id = v_present_game_id AND player_id = v_present_player_id
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.players
        WHERE id = v_present_player_id
          AND status = 'active'
          AND sitting_out = true
     ) THEN
    RAISE EXCEPTION 'postgame_forced_absence_proof:present-seat-retention:%',
      v_reconcile_outcome;
  END IF;

  RAISE NOTICE 'postgame_forced_absence_proof:passed';
END;
$proof$;

ROLLBACK;
