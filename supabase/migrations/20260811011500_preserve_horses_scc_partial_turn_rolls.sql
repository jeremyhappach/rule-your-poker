-- Preserve an interrupted human's remaining-roll budget when the autonomous
-- Dice driver takes over. The initial disconnect-safe migration assumed every
-- timed-out turn was unrolled; a timeout may instead occur after roll one or
-- two, so server auto-roll must consume only the persisted remainder.

DO $patch$
DECLARE
  v_function_sql text;
BEGIN
  SELECT pg_get_functiondef(
    'private.advance_horses_scc_expired_turn(uuid,timestamp with time zone)'::regprocedure
  ) INTO v_function_sql;

  IF v_function_sql LIKE '%v_rolls_remaining integer%' THEN
    RETURN;
  END IF;

  v_function_sql := replace(
    v_function_sql,
    E'  v_roll integer;\n',
    E'  v_roll integer;\n  v_rolls_remaining integer;\n'
  );
  v_function_sql := replace(
    v_function_sql,
    E'  FOR v_roll IN 1..3 LOOP',
    E'  BEGIN\n'
    || E'    v_rolls_remaining := (v_current_state ->> ''rollsRemaining'')::integer;\n'
    || E'  EXCEPTION WHEN invalid_text_representation THEN\n'
    || E'    RAISE EXCEPTION ''advance_horses_scc_expired_turn:invalid_rolls_remaining'';\n'
    || E'  END;\n'
    || E'  IF v_rolls_remaining NOT BETWEEN 1 AND 3 THEN\n'
    || E'    RAISE EXCEPTION ''advance_horses_scc_expired_turn:invalid_rolls_remaining'';\n'
    || E'  END IF;\n\n'
    || E'  FOR v_roll IN 1..v_rolls_remaining LOOP'
  );
  IF v_function_sql NOT LIKE '%FOR v_roll IN 1..v_rolls_remaining LOOP%' THEN
    RAISE EXCEPTION 'preserve_horses_scc_partial_turn_rolls:patch_target_not_found';
  END IF;
  EXECUTE v_function_sql;
END;
$patch$;
