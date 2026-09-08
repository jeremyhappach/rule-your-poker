BEGIN;
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


CREATE OR REPLACE PROCEDURE private.run_game_recovery_batch()
LANGUAGE plpgsql
SECURITY INVOKER
AS $procedure$
DECLARE
  v_tick integer;
  v_started_at timestamptz;
BEGIN
  -- No procedure SET clause, exception block, or enclosing transaction:
  -- transaction control must remain legal from a top-level cron CALL.
  FOR v_tick IN 1..32 LOOP
    v_started_at := pg_catalog.clock_timestamp();
    -- libpq cron cancellation closes its connection but may not interrupt a
    -- running CALL. Admit each tick only while this exact job still owns it.
    IF NOT EXISTS (
      SELECT 1 FROM cron.job
      WHERE jobname = 'advance-due-game-state-1s'
        AND username = current_user
        AND database = pg_catalog.current_database()
        AND active
        AND command = 'CALL private.run_game_recovery_batch();'
    ) THEN
      RETURN;
    END IF;
    PERFORM private.advance_due_game_state();
    COMMIT;

    -- Preserve cadence even at the batch boundary. Slow ticks reanchor to
    -- actual time, with no catch-up burst or second progression owner.
    PERFORM pg_catalog.pg_sleep(greatest(0,
      1 - extract(epoch FROM (pg_catalog.clock_timestamp() - v_started_at))));
    -- Sleep started a new transaction; don't reuse its timestamp next tick.
    COMMIT;
  END LOOP;
END;
$procedure$;

REVOKE ALL ON PROCEDURE private.run_game_recovery_batch()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON PROCEDURE private.run_game_recovery_batch() TO postgres;
COMMENT ON PROCEDURE private.run_game_recovery_batch() IS
  'Bounded backend reuse: 32 independent canonical recovery transactions at one-second cadence. Cron invoker only.';


COMMIT;
