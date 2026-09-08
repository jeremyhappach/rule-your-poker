-- Candidate implementation. NOT a production migration or cron switch.
-- Qualify in the explicitly approved disposable branch only.
-- Keep the existing dispatcher and its financial/identity owners unchanged.
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
