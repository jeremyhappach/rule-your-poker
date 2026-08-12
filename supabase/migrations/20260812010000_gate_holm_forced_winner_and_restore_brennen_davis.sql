-- Holm force-winner harnesses are executable only while the global
-- Harnesses Mode gate is enabled.  The per-game selection remains visible
-- to admins while disabled, but must not influence real gameplay.
DO $migration$
DECLARE
  v_definition text;
  v_declaration text := E'  v_forced_harness text;\n  v_harnesses_mode_enabled boolean := false;';
  v_previous_declaration text := E'  v_forced_harness text;';
  v_previous_read text := E'  SELECT debug_harness INTO v_forced_harness\n  FROM public.game_defaults\n  WHERE game_type = \'holm\'\n  LIMIT 1;';
  v_replacement_read text := E'  SELECT debug_harness INTO v_forced_harness\n  FROM public.game_defaults\n  WHERE game_type = \'holm\'\n  LIMIT 1;\n\n  SELECT COALESCE((value ->> \'enabled\')::boolean, false)\n  INTO v_harnesses_mode_enabled\n  FROM public.system_settings\n  WHERE key = \'harnesses_mode\'\n  LIMIT 1;\n  v_harnesses_mode_enabled := COALESCE(v_harnesses_mode_enabled, false);';
  v_previous_winner_case text := E'  v_player_wins := CASE v_forced_harness\n    WHEN \'force_player_beats_chucky\' THEN true\n    WHEN \'force_chucky_beats_player\' THEN false\n    ELSE v_player_value > v_chucky_value\n  END;';
  v_replacement_winner_case text := E'  v_player_wins := CASE\n    WHEN v_harnesses_mode_enabled\n      AND v_forced_harness = \'force_player_beats_chucky\' THEN true\n    WHEN v_harnesses_mode_enabled\n      AND v_forced_harness = \'force_chucky_beats_player\' THEN false\n    ELSE v_player_value > v_chucky_value\n  END;';
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_submit_decision(uuid,uuid,text)'::regprocedure
  ) INTO v_definition;

  IF position(v_replacement_winner_case IN v_definition) > 0
     AND position(v_replacement_read IN v_definition) > 0 THEN
    RETURN;
  END IF;

  IF position(v_previous_declaration IN v_definition) = 0
     OR position(v_previous_read IN v_definition) = 0
     OR position(v_previous_winner_case IN v_definition) = 0 THEN
    RAISE EXCEPTION 'holm_harness_gate:unexpected_holm_submit_decision_definition';
  END IF;

  v_definition := replace(v_definition, v_previous_declaration, v_declaration);
  v_definition := replace(v_definition, v_previous_read, v_replacement_read);
  v_definition := replace(v_definition, v_previous_winner_case, v_replacement_winner_case);
  EXECUTE v_definition;
END;
$migration$;

-- P0 live repair for Aug 11 - Brennen Davis, final Holm dealer game.
-- Preconditions prove the only terminal claim was the globally-disabled
-- force-player profile overriding a naturally stronger Chucky hand.
DO $repair$
DECLARE
  v_game_id constant uuid := '9d038912-c8b9-4512-977d-c2a7a4c5360c';
  v_dealer_game_id constant uuid := 'e856af77-42d1-4ff8-9964-6eb7231b6021';
  v_round_id constant uuid := 'cc00539d-805c-46e9-9164-8e8c3c62e381';
  v_award_id constant uuid := '0c1e8b64-de90-47cc-8a27-de072744911f';
  v_stayer_id constant uuid := '602e5505-da68-4b6d-9534-e60a380d3c44';
  v_folder_id constant uuid := 'a2c0775a-952c-4e90-91f2-37232f738ff4';
  v_timer_seconds integer;
  v_player_value integer[];
  v_chucky_value integer[];
BEGIN
  PERFORM 1
  FROM public.games g
  WHERE g.id = v_game_id
    AND g.status = 'session_ended'
    AND g.game_type = 'holm-game'
    AND g.current_game_uuid IS NULL
    AND g.pot = 0
    AND g.chip_transfer_cursor = 7;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'holm_live_restore:unexpected_game_state';
  END IF;

  PERFORM 1
  FROM public.rounds r
  WHERE r.id = v_round_id
    AND r.game_id = v_game_id
    AND r.dealer_game_id = v_dealer_game_id
    AND r.hand_number = 1
    AND r.status = 'completed'
    AND r.pot = 6;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'holm_live_restore:unexpected_round_state';
  END IF;

  PERFORM 1
  FROM public.game_results result
  WHERE result.id = v_award_id
    AND result.game_id = v_game_id
    AND result.dealer_game_id = v_dealer_game_id
    AND result.event_kind = 'chucky_final_award'
    AND result.winner_player_id = v_stayer_id
    AND result.pot_won = 6
    AND result.player_chip_changes = jsonb_build_object(v_stayer_id::text, 6);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'holm_live_restore:unexpected_terminal_claim';
  END IF;

  IF (SELECT debug_harness FROM public.game_defaults WHERE game_type = 'holm')
       <> 'force_player_beats_chucky'
     OR COALESCE((SELECT (value ->> 'enabled')::boolean
                   FROM public.system_settings WHERE key = 'harnesses_mode'), false) THEN
    RAISE EXCEPTION 'holm_live_restore:harness_precondition_failed';
  END IF;

  SELECT public.holm_best_hand_value(pc.cards || r.community_cards),
         public.holm_best_hand_value(r.chucky_cards || r.community_cards)
    INTO v_player_value, v_chucky_value
    FROM public.player_cards pc
    JOIN public.rounds r ON r.id = pc.round_id
   WHERE pc.round_id = v_round_id
     AND pc.player_id = v_stayer_id;
  IF v_player_value IS NULL OR v_chucky_value IS NULL
     OR NOT (v_player_value < v_chucky_value) THEN
    RAISE EXCEPTION 'holm_live_restore:natural_result_precondition_failed:%:%',
      v_player_value, v_chucky_value;
  END IF;

  SELECT COALESCE(decision_timer_seconds, 30)
    INTO v_timer_seconds
    FROM public.game_defaults
   WHERE game_type = 'holm';
  v_timer_seconds := COALESCE(v_timer_seconds, 30);

  -- Keep the original invalid payout batch immutable.  This compensating
  -- player-to-pot movement becomes the next canonical ledger batch.
  UPDATE public.games
     SET current_game_uuid = v_dealer_game_id
   WHERE id = v_game_id;
  PERFORM set_config('ptown.chip_transfer_reason', 'restore', true);
  UPDATE public.players
     SET chips = chips - 6
   WHERE id = v_stayer_id
     AND game_id = v_game_id
     AND chips = 10;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'holm_live_restore:unexpected_stayer_balance';
  END IF;
  UPDATE public.games
     SET pot = 6
   WHERE id = v_game_id;

  DELETE FROM public.player_transactions
   WHERE source_game_id = v_game_id
     AND transaction_type = 'SessionResult';
  DELETE FROM public.session_player_snapshots
   WHERE game_id = v_game_id
     AND dealer_game_id = v_dealer_game_id
     AND hand_number = 1;
  DELETE FROM public.game_results WHERE id = v_award_id;

  -- Reconstruct the recorded state immediately before the solo Stay action:
  -- the dealer (position 7) has folded, and position 4 is to act.
  UPDATE public.players
     SET status = 'active',
         sitting_out = false,
         ante_decision = 'ante_up',
         current_decision = CASE WHEN id = v_folder_id THEN 'fold' ELSE NULL END,
         decision_locked = (id = v_folder_id)
   WHERE game_id = v_game_id
     AND id IN (v_stayer_id, v_folder_id);

  UPDATE public.rounds
     SET status = 'betting',
         community_cards_revealed = 2,
         chucky_cards = '[]'::jsonb,
         chucky_cards_revealed = 0,
         chucky_active = false,
         current_turn_position = 4,
         pending_turn_position = NULL,
         decision_deadline = now() + make_interval(secs => v_timer_seconds),
         presentation_fallback_at = NULL
   WHERE id = v_round_id;

  UPDATE public.games
     SET status = 'in_progress',
         current_game_uuid = v_dealer_game_id,
         current_round = 1,
         total_hands = 1,
         buck_position = 7,
         current_host = 'e13e2dd9-6b38-4073-a313-2286877af40c'::uuid,
         config_complete = true,
         is_first_hand = false,
         all_decisions_in = false,
         all_decisions_in_round_id = NULL,
         awaiting_next_round = false,
         next_round_number = NULL,
         last_round_result = NULL,
         game_over_at = NULL,
         session_ended_at = NULL,
         pending_session_end = false,
         is_paused = true,
         paused_time_remaining = v_timer_seconds
   WHERE id = v_game_id;
END;
$repair$;
