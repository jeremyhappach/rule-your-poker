-- Retain historical failures, but admit only failures of an applicable owner.
-- The abandonment owner retires when waiting ends; a null dealer-game identity
-- alone does not make its old failure relevant to initial dealer setup.
DO $migration$
DECLARE
  v_definition text := pg_get_functiondef('private.evaluate_real_money_liveness(uuid)'::regprocedure);
  v_old text := 'WHERE f.game_id=p_game_id AND f.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid';
  v_new text := $replacement$WHERE f.game_id=p_game_id
      -- Only an applicable waiting-phase abandonment failure blocks admission.
      AND (f.task_name <> 'session_abandonment'
        OR (v_game.status IN ('waiting', 'waiting_for_players')
          AND v_game.current_game_uuid IS NULL))
      AND f.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid$replacement$;
BEGIN
  IF position(v_new IN v_definition) > 0 THEN RETURN; END IF;
  IF md5(v_definition) <> '31f01bf997a3396b3d2efe386add11e3'
     OR position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'waiting_failure_admission:unexpected_function_definition';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
