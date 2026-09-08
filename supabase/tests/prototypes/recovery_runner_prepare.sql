-- Approved rollout precondition and temporary matched-measurement setting.
-- Append the already-qualified recovery_runner_candidate.sql body.
DO $guard$
BEGIN
  IF (SELECT count(*) FROM cron.job WHERE jobname='advance-due-game-state-1s'
      AND schedule='1 second' AND username=current_user AND database=current_database()
      AND command='SELECT private.advance_due_game_state();')<>1
    OR to_regprocedure('private.advance_due_game_state()') IS NULL
    OR to_regprocedure('private.run_game_recovery_batch()') IS NOT NULL THEN
    RAISE EXCEPTION 'recovery_rollout:unexpected_preparation_state';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_db_role_setting s
    WHERE s.setrole=(SELECT oid FROM pg_roles WHERE rolname='postgres')
      AND s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND EXISTS(SELECT 1 FROM unnest(s.setconfig) c WHERE c LIKE 'pg_stat_statements.track=%')) THEN
    RAISE EXCEPTION 'recovery_rollout:existing_tracking_override';
  END IF;
END;
$guard$;
ALTER ROLE postgres IN DATABASE postgres SET pg_stat_statements.track='all';
