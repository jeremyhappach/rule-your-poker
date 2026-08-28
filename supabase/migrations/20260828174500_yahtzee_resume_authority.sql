-- Canonical pause/resume shifts Yahtzee's JSON-backed turn deadline. Open the
-- same transaction-local authority boundary used by every other Yahtzee RPC
-- before that exact resume mutation; authorization remains owned by
-- public.set_game_paused.

DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  -- set_game_paused:357_authority\n  IF v_game.game_type IN (''3-5-7'', ''3-5-7-game'', ''357'') THEN\n    PERFORM set_config(''app.three_five_seven_authoritative_write'', ''on'', true);\n  END IF;\n\n  UPDATE public.rounds round_row';
  v_after text := E'  -- set_game_paused:357_authority\n  IF v_game.game_type IN (''3-5-7'', ''3-5-7-game'', ''357'') THEN\n    PERFORM set_config(''app.three_five_seven_authoritative_write'', ''on'', true);\n  END IF;\n\n  -- set_game_paused:yahtzee_authority\n  IF v_game.game_type = ''yahtzee'' THEN\n    PERFORM set_config(''app.yahtzee_authoritative_write'', ''on'', true);\n  END IF;\n\n  UPDATE public.rounds round_row';
BEGIN
  SELECT pg_get_functiondef('public.set_game_paused(uuid,boolean)'::regprocedure)
    INTO v_definition;

  IF position('set_game_paused:yahtzee_authority' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'yahtzee_resume_authority:set_game_paused_shape_changed';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END
$migration$;
