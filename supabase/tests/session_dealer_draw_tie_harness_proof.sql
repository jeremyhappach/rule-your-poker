-- Execute only inside a transaction that also installs the candidate migration.
-- The caller must ROLLBACK after this block; every synthetic game/player/timer
-- and harness-setting mutation is transaction-local.

DO $proof$
DECLARE
  v_admin uuid;
  v_non_admin uuid;
  v_game uuid := gen_random_uuid();
  v_expired_game uuid := gen_random_uuid();
  v_wrong_host_game uuid := gen_random_uuid();
  v_second_game uuid := gen_random_uuid();
  v_result jsonb;
  v_state jsonb;
  v_setting jsonb;
  v_state_before_replay jsonb;
  v_original_harnesses_mode jsonb;
BEGIN
  SELECT role_row.user_id
    INTO v_admin
    FROM public.user_roles role_row
    JOIN auth.users auth_user ON auth_user.id = role_row.user_id
   WHERE role_row.role::text = 'admin'
   ORDER BY auth_user.created_at
   LIMIT 1;

  SELECT auth_user.id
    INTO v_non_admin
    FROM auth.users auth_user
   WHERE auth_user.id <> v_admin
     AND NOT public.has_role(auth_user.id, 'admin')
   ORDER BY auth_user.created_at
   LIMIT 1;

  IF v_admin IS NULL OR v_non_admin IS NULL THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:missing_admin_or_non_admin_fixture';
  END IF;

  SELECT setting.value INTO v_original_harnesses_mode
    FROM public.system_settings setting
   WHERE setting.key = 'harnesses_mode';

  -- Authorization: ordinary authenticated users cannot arm or cancel.
  PERFORM set_config('request.jwt.claim.sub', v_non_admin::text, true);
  v_result := public.arm_session_dealer_draw_tie_harness(600);
  IF v_result->>'outcome' <> 'not_authorized' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:non_admin_arm_allowed:%', v_result;
  END IF;
  v_result := public.cancel_session_dealer_draw_tie_harness();
  IF v_result->>'outcome' <> 'not_authorized' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:non_admin_cancel_allowed:%', v_result;
  END IF;

  -- Tie/winner: the host-scoped request must produce exactly two waves and a
  -- deterministic winner while using the normal authoritative phase owner.
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  v_result := public.arm_session_dealer_draw_tie_harness(600);
  IF v_result->>'outcome' <> 'armed' OR (v_result->>'armed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:admin_arm_failed:%', v_result;
  END IF;

  INSERT INTO public.games (
    id, status, game_type, current_host, real_money, timer_generation, is_paused
  ) VALUES (
    v_game, 'dealer_selection', 'holm', v_admin, true, 101, false
  );
  INSERT INTO public.players (game_id, user_id, chips, position)
  VALUES
    (v_game, v_admin, 100, 1),
    (v_game, v_non_admin, 100, 2);

  v_result := private.prepare_session_dealer_selection(v_game, 101);
  IF v_result->>'outcome' <> 'prepared' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:prepare_failed:%', v_result;
  END IF;
  SELECT game.dealer_selection_state INTO v_state
    FROM public.games game WHERE game.id = v_game;

  IF v_state->>'harnessApplied' <> 'force_first_round_tie_once'
     OR jsonb_array_length(v_state->'cards') <> 4
     OR (v_state->>'winnerPosition')::integer <> 1 THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:wrong_forced_state:%', v_state;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_state->'cards') card
       WHERE (card->>'roundNumber')::integer = 1 AND card#>>'{card,rank}' = 'A') <> 2
     OR (SELECT count(*) FROM jsonb_array_elements(v_state->'cards') card
         WHERE (card->>'roundNumber')::integer = 2) <> 2 THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:tie_waves_missing:%', v_state;
  END IF;
  IF (SELECT count(DISTINCT (card#>>'{card,rank}') || ':' || (card#>>'{card,suit}'))
        FROM jsonb_array_elements(v_state->'cards') card) <> 4 THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:duplicate_cards:%', v_state;
  END IF;

  SELECT setting.value INTO v_setting
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness';
  IF coalesce((v_setting->>'armed')::boolean, false)
     OR (v_setting->>'consumedGameId')::uuid <> v_game THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:not_consumed_once:%', v_setting;
  END IF;

  -- Duplicate/replay: the already-prepared identity is immutable.
  v_state_before_replay := v_state;
  v_result := private.prepare_session_dealer_selection(v_game, 101);
  IF v_result->>'outcome' <> 'already_prepared' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:duplicate_not_deduped:%', v_result;
  END IF;
  SELECT game.dealer_selection_state INTO v_state
    FROM public.games game WHERE game.id = v_game;
  IF v_state IS DISTINCT FROM v_state_before_replay THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:replay_mutated_state';
  END IF;
  v_result := private.prepare_session_dealer_selection(v_game, 100);
  IF v_result->>'outcome' <> 'stale_identity' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:old_generation_not_rejected:%', v_result;
  END IF;

  -- Continuation: once presentation time has elapsed, the unchanged canonical
  -- completion owner advances to setup with the forced winner.
  UPDATE public.games
     SET dealer_selection_state = dealer_selection_state || jsonb_build_object(
       'preparedAt', clock_timestamp() - interval '4 seconds'
     )
   WHERE id = v_game;
  v_result := private.complete_session_dealer_selection(v_game, 101);
  IF v_result->>'outcome' <> 'advanced'
     OR v_result->>'status' <> 'game_selection'
     OR (v_result->>'dealer_position')::integer <> 1 THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:continuation_failed:%', v_result;
  END IF;

  -- Late replay and terminal state cannot prepare or consume another request.
  v_result := private.prepare_session_dealer_selection(v_game, 101);
  IF v_result->>'outcome' <> 'stale_identity' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:late_replay_not_rejected:%', v_result;
  END IF;
  UPDATE public.games SET status = 'session_ended' WHERE id = v_game;
  v_result := private.prepare_session_dealer_selection(v_game, 101);
  IF v_result->>'outcome' <> 'stale_identity' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:terminal_prepare_not_rejected:%', v_result;
  END IF;

  -- Expiry: an expired request leaves the normal shuffle and the pending value
  -- untouched (so status can report it as inactive without pretending consume).
  v_result := public.arm_session_dealer_draw_tie_harness(600);
  UPDATE public.system_settings
     SET value = value || jsonb_build_object('expiresAt', clock_timestamp() - interval '1 second')
   WHERE key = 'session_dealer_draw_tie_harness';
  INSERT INTO public.games (id, status, game_type, current_host, timer_generation)
  VALUES (v_expired_game, 'dealer_selection', 'holm', v_admin, 102);
  INSERT INTO public.players (game_id, user_id, chips, position)
  VALUES
    (v_expired_game, v_admin, 100, 1),
    (v_expired_game, v_non_admin, 100, 2);
  v_result := private.prepare_session_dealer_selection(v_expired_game, 102);
  SELECT game.dealer_selection_state INTO v_state
    FROM public.games game WHERE game.id = v_expired_game;
  IF v_result->>'outcome' <> 'prepared' OR v_state ? 'harnessApplied' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:expired_fixture_applied:%/%', v_result, v_state;
  END IF;

  -- Host scope: another host cannot consume the request; the intended host can
  -- consume it once, and a subsequent session returns to normal shuffle.
  v_result := public.arm_session_dealer_draw_tie_harness(600);
  INSERT INTO public.games (id, status, game_type, current_host, timer_generation)
  VALUES (v_wrong_host_game, 'dealer_selection', 'holm', v_non_admin, 103);
  INSERT INTO public.players (game_id, user_id, chips, position)
  VALUES
    (v_wrong_host_game, v_non_admin, 100, 1),
    (v_wrong_host_game, v_admin, 100, 2);
  v_result := private.prepare_session_dealer_selection(v_wrong_host_game, 103);
  SELECT game.dealer_selection_state INTO v_state
    FROM public.games game WHERE game.id = v_wrong_host_game;
  SELECT setting.value INTO v_setting
    FROM public.system_settings setting
   WHERE setting.key = 'session_dealer_draw_tie_harness';
  IF v_state ? 'harnessApplied' OR NOT coalesce((v_setting->>'armed')::boolean, false) THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:wrong_host_consumed:%/%', v_state, v_setting;
  END IF;

  INSERT INTO public.games (id, status, game_type, current_host, timer_generation)
  VALUES (v_second_game, 'dealer_selection', 'holm', v_admin, 104);
  INSERT INTO public.players (game_id, user_id, chips, position)
  VALUES
    (v_second_game, v_admin, 100, 1),
    (v_second_game, v_non_admin, 100, 2);
  v_result := private.prepare_session_dealer_selection(v_second_game, 104);
  SELECT game.dealer_selection_state INTO v_state
    FROM public.games game WHERE game.id = v_second_game;
  IF v_state->>'harnessApplied' <> 'force_first_round_tie_once' THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:intended_host_did_not_consume:%', v_state;
  END IF;

  -- The dedicated one-shot fixture must never touch the persistent global gate.
  IF (SELECT setting.value FROM public.system_settings setting
       WHERE setting.key = 'harnesses_mode') IS DISTINCT FROM v_original_harnesses_mode THEN
    RAISE EXCEPTION 'dealer_draw_tie_proof:global_harness_gate_mutated';
  END IF;
END;
$proof$;
