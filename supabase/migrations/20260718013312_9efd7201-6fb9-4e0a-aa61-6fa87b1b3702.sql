CREATE OR REPLACE FUNCTION public.admin_delete_fake_money_games()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_ids uuid[];
  v_dealer_game_ids uuid[];
  v_round_ids uuid[];
  v_player_ids uuid[];
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT array_agg(id) INTO v_game_ids FROM public.games WHERE real_money = false;
  IF v_game_ids IS NULL OR array_length(v_game_ids,1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(id) INTO v_dealer_game_ids FROM public.dealer_games WHERE session_id = ANY(v_game_ids);
  SELECT array_agg(id) INTO v_round_ids
    FROM public.rounds
   WHERE game_id = ANY(v_game_ids)
      OR (v_dealer_game_ids IS NOT NULL AND dealer_game_id = ANY(v_dealer_game_ids));
  SELECT array_agg(id) INTO v_player_ids FROM public.players WHERE game_id = ANY(v_game_ids);

  IF v_round_ids IS NOT NULL THEN
    DELETE FROM public.cribbage_events WHERE round_id = ANY(v_round_ids);
    DELETE FROM public.player_actions WHERE round_id = ANY(v_round_ids);
    DELETE FROM public.player_cards  WHERE round_id = ANY(v_round_ids);
    DELETE FROM public.dice_roll_audit WHERE round_id = ANY(v_round_ids);
    UPDATE public.rounds SET predecessor_round_id = NULL WHERE id = ANY(v_round_ids);
  END IF;

  IF v_player_ids IS NOT NULL THEN
    DELETE FROM public.game_results WHERE winner_player_id = ANY(v_player_ids);
    DELETE FROM public.chip_stack_emoticons WHERE player_id = ANY(v_player_ids);
  END IF;

  DELETE FROM public.game_results WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.session_player_snapshots WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chat_messages WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chat_send_operations WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chat_operation_reports WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.chip_stack_emoticons WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.dice_roll_audit WHERE game_id = ANY(v_game_ids);

  -- rounds BEFORE dealer_games (rounds.dealer_game_id -> dealer_games)
  IF v_round_ids IS NOT NULL THEN
    DELETE FROM public.rounds WHERE id = ANY(v_round_ids);
  END IF;
  DELETE FROM public.rounds WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.dealer_games WHERE session_id = ANY(v_game_ids);
  DELETE FROM public.players WHERE game_id = ANY(v_game_ids);
  DELETE FROM public.games WHERE id = ANY(v_game_ids);

  v_count := array_length(v_game_ids, 1);
  RETURN v_count;
END;
$$;