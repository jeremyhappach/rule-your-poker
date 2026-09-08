-- The release operator first disables this job and verifies its backend drained.
-- This transaction also serializes with the canonical dispatcher, including replay.
BEGIN;
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(357357,20260820);
DO $enable$
DECLARE target record;
BEGIN
  SELECT * INTO STRICT target FROM cron.job WHERE jobname='advance-due-game-state-1s';
  IF target.schedule IS DISTINCT FROM '1 second'
    OR target.username IS DISTINCT FROM current_user
    OR target.database IS DISTINCT FROM current_database()
    OR (target.command IS DISTINCT FROM 'SELECT private.advance_due_game_state();'
      AND target.command IS DISTINCT FROM 'CALL private.run_game_recovery_batch();')
    OR to_regprocedure('private.run_game_recovery_batch()') IS NULL THEN
    RAISE EXCEPTION 'recovery_rollout:unexpected_switch_state';
  END IF;
  PERFORM cron.alter_job(job_id:=target.jobid,
    command:='CALL private.run_game_recovery_batch();',active:=true);
END;
$enable$;
COMMIT;
