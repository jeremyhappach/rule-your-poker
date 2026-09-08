-- Isolated self-interruption target. Expected result: SQLSTATE 57014.
-- Commits three empty ticks, then cancels ONLY its own backend while holding
-- a probe-only transaction lock. This is not a live-cron restart test.
-- No production dispatcher, cron command, game row or financial RPC is called.
DO $reuse_cancel_probe_20260908$
DECLARE v_tick integer;
BEGIN
  FOR v_tick IN 1..3 LOOP
    PERFORM pg_catalog.set_config('reuse_probe.local_context','present',true);
    COMMIT;
    PERFORM pg_catalog.pg_sleep(1);
    COMMIT;
  END LOOP;
  PERFORM pg_catalog.set_config('application_name','codex-reuse-cancel-20260908',true);
  PERFORM pg_catalog.pg_advisory_xact_lock(987654,20260909);
  PERFORM pg_catalog.pg_cancel_backend(pg_catalog.pg_backend_pid());
  PERFORM pg_catalog.pg_sleep(0.01);
  RAISE EXCEPTION 'reuse_proof:expected_cancel_missing';
END;
$reuse_cancel_probe_20260908$;
