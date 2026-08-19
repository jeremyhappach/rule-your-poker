-- A pending session end uses the same exact terminal presentation identity as
-- game_over. After authoritative postgame advancement, session_ended remains
-- valid with the deliberately cleared dealer-game/hand/round address.

DO $guard_session_terminal_identity$
DECLARE
  v_frame_signature regprocedure := to_regprocedure(
    'public.three_five_seven_current_frame(uuid)'
  );
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  IF v_frame_signature IS NULL THEN
    RAISE EXCEPTION 'guard_357_session_terminal_identity:current_frame_function_missing';
  END IF;

  SELECT pg_get_functiondef(v_frame_signature) INTO v_definition;
  v_old := E'  IF v_game.status = ''game_over''\n     AND (v_game.current_game_uuid IS NULL\n       OR v_game.total_hands IS NULL\n       OR v_game.current_round IS NULL) THEN\n    RAISE EXCEPTION ''three_five_seven_current_frame:terminal_round_identity_missing'';\n  END IF;';
  v_new := E'  IF (\n       v_game.status = ''game_over''\n       OR (\n         v_game.status = ''session_ended''\n         AND (\n           v_game.current_game_uuid IS NOT NULL\n           OR coalesce(v_game.total_hands, 0) > 0\n           OR v_game.current_round IS NOT NULL\n         )\n       )\n     )\n     AND (\n       v_game.current_game_uuid IS NULL\n       OR coalesce(v_game.total_hands, 0) < 1\n       OR v_game.current_round IS NULL\n     ) THEN\n    RAISE EXCEPTION ''three_five_seven_current_frame:terminal_round_identity_missing'';\n  END IF;';

  IF strpos(v_definition, v_new) = 0 THEN
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'guard_357_session_terminal_identity:terminal_guard_patch_target_mismatch';
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
  END IF;

  v_old := E'  IF v_game.status IN (''in_progress'',''game_over'')';
  v_new := E'  IF v_game.status IN (''in_progress'',''game_over'',''session_ended'')';
  IF strpos(v_definition, v_new) = 0 THEN
    IF strpos(v_definition, v_old) = 0
       OR length(v_definition) - length(replace(v_definition, v_old, '')) <> length(v_old) THEN
      RAISE EXCEPTION 'guard_357_session_terminal_identity:exact_round_patch_target_mismatch';
    END IF;
    v_definition := replace(v_definition, v_old, v_new);
  END IF;

  EXECUTE v_definition;
END;
$guard_session_terminal_identity$;

COMMENT ON FUNCTION public.three_five_seven_current_frame(uuid) IS
  'Returns one exact MVCC 3-5-7 frame. Charged Round 1 validates its immutable opening transfer claim, and pre-handoff game_over/session_ended preserves the exact terminal round until authoritative postgame advancement; Realtime is refetch only.';
