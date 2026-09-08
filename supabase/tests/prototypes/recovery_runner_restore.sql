-- Operational rollback: disable the canonical job, verify the old CALL drained,
-- then run this transaction. Preserve the procedure and all gameplay state.
BEGIN;
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(357357,20260820);
DO $restore$
DECLARE target record;
BEGIN
  SELECT * INTO STRICT target FROM cron.job WHERE jobname='advance-due-game-state-1s';
  IF target.schedule IS DISTINCT FROM '1 second'
    OR target.username IS DISTINCT FROM current_user
    OR target.database IS DISTINCT FROM current_database()
    OR (target.command IS DISTINCT FROM 'SELECT private.advance_due_game_state();'
      AND target.command IS DISTINCT FROM 'CALL private.run_game_recovery_batch();') THEN
    RAISE EXCEPTION 'recovery_rollout:unexpected_restore_state';
  END IF;
  PERFORM cron.alter_job(job_id:=target.jobid,
    command:='SELECT private.advance_due_game_state();',active:=true);
END;
$restore$;
ALTER ROLE postgres IN DATABASE postgres RESET pg_stat_statements.track;
COMMIT;
