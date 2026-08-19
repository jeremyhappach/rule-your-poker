-- Keep the exact terminal round addressable until the authoritative postgame
-- handoff clears the outgoing dealer-game identity. Connected clients must be
-- able to admit the game_over frame without depending on recovery cron.

DO $preserve_terminal_round_identity$
DECLARE
  v_settlement_signature regprocedure := to_regprocedure(
    'public.three_five_seven_settle_game_authority_impl(uuid,uuid,uuid,integer)'
  );
  v_frame_signature regprocedure := to_regprocedure(
    'public.three_five_seven_current_frame(uuid)'
  );
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  IF v_settlement_signature IS NULL THEN
    RAISE EXCEPTION 'preserve_357_terminal_round_identity:settlement_function_missing';
  END IF;

  SELECT pg_get_functiondef(v_settlement_signature) INTO v_definition;
  v_old := E'         pot = 0,\n         current_round = NULL,\n         awaiting_next_round = false,';
  v_new := E'         pot = 0,\n         current_game_uuid = p_dealer_game_id,\n         total_hands = p_hand_number,\n         current_round = v_round.round_number,\n         awaiting_next_round = false,';

  IF strpos(v_definition, v_new) = 0 THEN
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'preserve_357_terminal_round_identity:settlement_patch_target_mismatch';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;

  IF v_frame_signature IS NULL THEN
    RAISE EXCEPTION 'preserve_357_terminal_round_identity:current_frame_function_missing';
  END IF;

  SELECT pg_get_functiondef(v_frame_signature) INTO v_definition;
  v_old := E'  IF v_game.current_game_uuid IS NOT NULL\n     AND v_game.total_hands IS NOT NULL\n     AND v_game.current_round IS NOT NULL THEN';
  v_new := E'  IF v_game.status = ''game_over''\n     AND (v_game.current_game_uuid IS NULL\n       OR v_game.total_hands IS NULL\n       OR v_game.current_round IS NULL) THEN\n    RAISE EXCEPTION ''three_five_seven_current_frame:terminal_round_identity_missing'';\n  END IF;\n\n  IF v_game.current_game_uuid IS NOT NULL\n     AND v_game.total_hands IS NOT NULL\n     AND v_game.current_round IS NOT NULL THEN';

  IF strpos(v_definition, v_new) = 0 THEN
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'preserve_357_terminal_round_identity:current_frame_patch_target_mismatch';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END IF;
END;
$preserve_terminal_round_identity$;

COMMENT ON FUNCTION public.three_five_seven_current_frame(uuid) IS
  'Returns one exact MVCC 3-5-7 frame. Charged Round 1 validates its immutable opening transfer claim, and game_over preserves the exact terminal round until authoritative postgame advancement; Realtime is refetch only.';
