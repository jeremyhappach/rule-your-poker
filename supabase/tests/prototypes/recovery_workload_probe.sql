-- Disposable no-data database only. Caller must verify the approved branch ref.
-- Same observer is present for the original SELECT and candidate CALL windows.
DO $guard$
BEGIN
  IF to_regprocedure('private.advance_due_game_state()') IS NULL
     OR EXISTS (SELECT 1 FROM public.games) THEN
    RAISE EXCEPTION 'workload_probe:requires_restored_empty_test_database';
  END IF;
END;
$guard$;

CREATE SCHEMA recovery_workload_probe;
REVOKE ALL ON SCHEMA recovery_workload_probe FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE recovery_workload_probe.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  phase text NOT NULL
);
INSERT INTO recovery_workload_probe.control VALUES (true,'setup');
CREATE TABLE recovery_workload_probe.ticks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phase text NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  outcome text NOT NULL,
  pid integer NOT NULL,
  xid xid8 NOT NULL,
  safety_task text,
  timeout_setting text NOT NULL
);
CREATE FUNCTION recovery_workload_probe.capture_tick() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='pg_catalog' AS $capture$
BEGIN
  INSERT INTO recovery_workload_probe.ticks
    (phase,completed_at,duration_ms,outcome,pid,xid,safety_task,timeout_setting)
  SELECT phase,NEW.last_completed_at,NEW.last_duration_ms,NEW.last_outcome,
    pg_backend_pid(),pg_current_xact_id(),NEW.last_safety_task,current_setting('statement_timeout')
  FROM recovery_workload_probe.control WHERE singleton;
  RETURN NEW;
END;
$capture$;
CREATE TRIGGER recovery_workload_probe_tick
AFTER UPDATE ON private.game_recovery_dispatch_state
FOR EACH ROW WHEN (NEW.last_completed_at IS DISTINCT FROM OLD.last_completed_at)
EXECUTE FUNCTION recovery_workload_probe.capture_tick();
REVOKE ALL ON ALL TABLES IN SCHEMA recovery_workload_probe FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA recovery_workload_probe FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA recovery_workload_probe FROM PUBLIC,anon,authenticated,service_role;

-- Branch-only visibility: a CALL's elapsed time includes intentional sleeps;
-- nested statement counters must not be added to their inclusive parents.
ALTER ROLE postgres IN DATABASE postgres SET pg_stat_statements.track='all';
