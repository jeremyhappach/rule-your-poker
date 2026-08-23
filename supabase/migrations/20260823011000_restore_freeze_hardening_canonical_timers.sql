-- The canonical timer cutover extended the serialized task runner after its
-- original migration. Preserve that later owner when freeze hardening replaces
-- the runner body, including on databases that briefly received the older body.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  CASE p_task_name\n    WHEN ''holm'' THEN';
  v_after text := E'  CASE p_task_name\n    WHEN ''canonical_timers'' THEN\n      PERFORM private.advance_due_canonical_game_timers();\n    WHEN ''holm'' THEN';
BEGIN
  SELECT pg_get_functiondef('private.run_due_game_recovery_task(text)'::regprocedure)
    INTO v_definition;

  IF position('WHEN ''canonical_timers''' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'restore_freeze_hardening_canonical_timers:runner_shape_changed';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END
$migration$;

COMMENT ON FUNCTION private.run_due_game_recovery_task(text) IS
  'Isolated recovery task runner for canonical timers and every game owner. A 750 ms lock budget prevents one blocked task from starving later games.';
