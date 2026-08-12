-- Rollback-only proof for the database-owned Holm force-winner gate.
-- Run after the initial-hand and staged-projection proofs.  It verifies that
-- a configured force profile is inert while Harnesses Mode is disabled, and
-- still works when the master gate is explicitly enabled.

BEGIN;

DO $proof$
DECLARE
  v_users uuid[];
  v_game_id uuid := gen_random_uuid();
  v_dealer_game_id uuid := gen_random_uuid();
  v_enabled_game_id uuid := gen_random_uuid();
  v_enabled_dealer_game_id uuid := gen_random_uuid();
  v_stayer_id uuid;
  v_folder_id uuid;
  v_round_id uuid;
  v_result jsonb;
  v_replay jsonb;
BEGIN
  SELECT array_agg(id ORDER BY created_at, id)
    INTO v_users
    FROM (SELECT id, created_at FROM public.profiles ORDER BY created_at, id LIMIT 2) profiles;
  IF coalesce(cardinality(v_users), 0) < 2 THEN
    RAISE EXCEPTION 'holm_harness_gate_proof:requires_two_profiles';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_users[1]::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);

  UPDATE public.game_defaults
     SET debug_harness = 'force_player_beats_chucky'
   WHERE game_type = 'holm';
  UPDATE public.system_settings
     SET value = jsonb_build_object('enabled', false)
   WHERE key = 'harnesses_mode';

  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_game_id, 'Codex rollback proof - Holm harness disabled', 'ante_decision',
    'holm-game', v_dealer_game_id, v_users[1], 2, true, 1, 0, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_dealer_game_id, v_game_id, v_users[1], 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', true);
  SELECT id INTO v_stayer_id FROM public.players WHERE game_id = v_game_id AND position = 1;
  SELECT id INTO v_folder_id FROM public.players WHERE game_id = v_game_id AND position = 2;
  PERFORM public.start_holm_initial_hand(v_game_id, false);
  SELECT id INTO v_round_id FROM public.rounds WHERE game_id = v_game_id;

  UPDATE public.rounds
     SET community_cards = '[{"rank":"9","suit":"♦"},{"rank":"3","suit":"♦"},{"rank":"Q","suit":"♥"},{"rank":"5","suit":"♠"}]'::jsonb,
         chucky_cards = '[{"rank":"6","suit":"♣"},{"rank":"A","suit":"♥"},{"rank":"5","suit":"♥"},{"rank":"6","suit":"♦"}]'::jsonb
   WHERE id = v_round_id;
  UPDATE public.player_cards
     SET cards = '[{"rank":"6","suit":"♠"},{"rank":"A","suit":"♠"},{"rank":"K","suit":"♥"},{"rank":"A","suit":"♣"}]'::jsonb
   WHERE round_id = v_round_id AND player_id = v_stayer_id;

  PERFORM public.holm_submit_decision(v_game_id, v_stayer_id, 'stay');
  SELECT public.holm_submit_decision(v_game_id, v_folder_id, 'fold') INTO v_result;
  IF v_result->>'event_kind' <> 'chucky_loss_pot_match'
     OR (SELECT status FROM public.games WHERE id = v_game_id) <> 'in_progress'
     OR (SELECT pot FROM public.games WHERE id = v_game_id) <> 4
     OR (SELECT chips FROM public.players WHERE id = v_stayer_id) <> 97
     OR (SELECT chucky_active FROM public.rounds WHERE id = v_round_id) IS DISTINCT FROM true
     OR (SELECT chucky_cards_revealed FROM public.rounds WHERE id = v_round_id) <> 4
     OR (SELECT status FROM public.rounds WHERE id = v_round_id) <> 'completed' THEN
    RAISE EXCEPTION 'holm_harness_gate_proof:disabled_gate_did_not_preserve_natural_loss:%', v_result;
  END IF;
  SELECT public.holm_submit_decision(v_game_id, v_folder_id, 'fold') INTO v_replay;
  IF v_replay->>'round_not_betting' <> 'true'
     OR (SELECT count(*) FROM public.game_results WHERE game_id = v_game_id) <> 2 THEN
    RAISE EXCEPTION 'holm_harness_gate_proof:disabled_replay_not_inert:%', v_replay;
  END IF;

  UPDATE public.system_settings
     SET value = jsonb_build_object('enabled', true)
   WHERE key = 'harnesses_mode';
  INSERT INTO public.games (
    id, name, status, game_type, current_game_uuid, current_host,
    dealer_position, is_first_hand, ante_amount, pot, real_money
  ) VALUES (
    v_enabled_game_id, 'Codex rollback proof - Holm harness enabled', 'ante_decision',
    'holm-game', v_enabled_dealer_game_id, v_users[1], 2, true, 1, 0, false
  );
  INSERT INTO public.dealer_games (id, session_id, dealer_user_id, game_type)
  VALUES (v_enabled_dealer_game_id, v_enabled_game_id, v_users[1], 'holm');
  INSERT INTO public.players (game_id, user_id, position, chips, status, sitting_out, ante_decision, is_bot)
  VALUES
    (v_enabled_game_id, v_users[1], 1, 100, 'active', false, 'ante_up', false),
    (v_enabled_game_id, v_users[2], 2, 100, 'active', false, 'ante_up', true);
  SELECT id INTO v_stayer_id FROM public.players WHERE game_id = v_enabled_game_id AND position = 1;
  SELECT id INTO v_folder_id FROM public.players WHERE game_id = v_enabled_game_id AND position = 2;
  PERFORM public.start_holm_initial_hand(v_enabled_game_id, false);
  SELECT id INTO v_round_id FROM public.rounds WHERE game_id = v_enabled_game_id;
  UPDATE public.rounds
     SET community_cards = '[{"rank":"9","suit":"♦"},{"rank":"3","suit":"♦"},{"rank":"Q","suit":"♥"},{"rank":"5","suit":"♠"}]'::jsonb,
         chucky_cards = '[{"rank":"6","suit":"♣"},{"rank":"A","suit":"♥"},{"rank":"5","suit":"♥"},{"rank":"6","suit":"♦"}]'::jsonb
   WHERE id = v_round_id;
  UPDATE public.player_cards
     SET cards = '[{"rank":"6","suit":"♠"},{"rank":"A","suit":"♠"},{"rank":"K","suit":"♥"},{"rank":"A","suit":"♣"}]'::jsonb
   WHERE round_id = v_round_id AND player_id = v_stayer_id;
  PERFORM public.holm_submit_decision(v_enabled_game_id, v_stayer_id, 'stay');
  SELECT public.holm_submit_decision(v_enabled_game_id, v_folder_id, 'fold') INTO v_result;
  IF v_result->>'event_kind' <> 'chucky_final_award'
     OR (SELECT status FROM public.games WHERE id = v_enabled_game_id) <> 'game_over'
     OR (SELECT chips FROM public.players WHERE id = v_stayer_id) <> 101 THEN
    RAISE EXCEPTION 'holm_harness_gate_proof:enabled_gate_did_not_force_award:%', v_result;
  END IF;

  RAISE NOTICE 'holm_harness_gate_proof:passed';
END;
$proof$;

ROLLBACK;
