-- The canonical timer registry column is named `phase`. Correct the redacted
-- health projection without changing timer ownership or any game row.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'private.evaluate_real_money_liveness(uuid)'::regprocedure
  ) INTO v_definition;

  IF position('timer.phase_key' IN v_definition) = 0 THEN
    RETURN;
  END IF;

  EXECUTE replace(v_definition, 'timer.phase_key', 'timer.phase');
END
$migration$;

COMMENT ON FUNCTION private.evaluate_real_money_liveness(uuid) IS
  'Machine-readable recovery health for real-money admission and incident evidence. Paused games and absent Gin/Cribbage human-turn timers are not classified as stagnation.';
