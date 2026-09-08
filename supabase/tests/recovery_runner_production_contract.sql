-- Read-only installed scheduler / liveness / privilege contract.
BEGIN READ ONLY;
DO $proof$
DECLARE p record; j record;
BEGIN
  SELECT * INTO STRICT p FROM pg_proc WHERE oid='private.run_game_recovery_batch()'::regprocedure;
  IF p.prokind<>'p' OR p.prosecdef OR p.proconfig IS NOT NULL
    OR pg_get_userbyid(p.proowner)<>'postgres'
    OR NOT has_function_privilege('postgres',p.oid,'EXECUTE')
    OR has_function_privilege('anon',p.oid,'EXECUTE')
    OR has_function_privilege('authenticated',p.oid,'EXECUTE')
    OR has_function_privilege('service_role',p.oid,'EXECUTE') THEN
    RAISE EXCEPTION 'recovery_runner_contract:procedure_privilege';
  END IF;
  SELECT * INTO STRICT j FROM cron.job WHERE jobname='advance-due-game-state-1s';
  IF NOT j.active OR j.schedule IS DISTINCT FROM '1 second'
    OR j.command IS DISTINCT FROM 'CALL private.run_game_recovery_batch();'
    OR j.username IS DISTINCT FROM 'postgres'
    OR j.database IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'recovery_runner_contract:canonical_job';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM private.game_recovery_dispatch_state
    WHERE singleton AND last_completed_at>clock_timestamp()-interval '10 seconds'
      AND last_outcome='completed' AND consecutive_partial_failures=0)
    OR EXISTS(SELECT 1 FROM private.game_recovery_failures)
    OR EXISTS(SELECT 1 FROM private.game_recovery_unit_failures) THEN
    RAISE EXCEPTION 'recovery_runner_contract:unhealthy';
  END IF;
END;
$proof$;
COMMIT;
