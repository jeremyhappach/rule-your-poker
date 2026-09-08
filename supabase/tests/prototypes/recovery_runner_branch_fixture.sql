-- ISOLATED SCHEDULER FIXTURE ONLY. Never apply to production.
-- This deliberately substitutes a fixture for the missing dispatcher on the
-- disposable, partially migrated branch. It is NOT an all-game safety proof.
DO $guard$
BEGIN
  IF to_regprocedure('private.advance_due_game_state()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.games) THEN
    RAISE EXCEPTION 'runner_fixture:requires_empty_nonproduction_dispatcher';
  END IF;
END;
$guard$;
CREATE SCHEMA runner_probe;
REVOKE ALL ON SCHEMA runner_probe FROM PUBLIC, anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE runner_probe.control(mode text NOT NULL);
INSERT INTO runner_probe.control VALUES ('normal');
CREATE SEQUENCE runner_probe.attempt;
CREATE TABLE runner_probe.ticks(
  attempt bigint PRIMARY KEY, pid integer NOT NULL, xid xid8 NOT NULL,
  started_at timestamptz NOT NULL, transaction_at timestamptz NOT NULL,
  statement_at timestamptz NOT NULL, timeout_setting text NOT NULL,
  finished_at timestamptz NOT NULL
);
CREATE FUNCTION private.advance_due_game_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','public','private'
AS $fixture$
DECLARE
  v_attempt bigint := nextval('runner_probe.attempt');
  v_started timestamptz := clock_timestamp();
  v_mode text;
BEGIN
  IF nullif(current_setting('runner_probe.local_context',true),'') IS NOT NULL THEN
    RAISE EXCEPTION 'runner_fixture:context_leaked';
  END IF;
  IF NOT pg_try_advisory_xact_lock(987654,20260910) THEN
    RAISE EXCEPTION 'runner_fixture:overlap';
  END IF;
  PERFORM set_config('runner_probe.local_context','present',true);
  SELECT mode INTO v_mode FROM runner_probe.control;
  IF v_mode='slow_once' AND v_attempt=6 THEN PERFORM pg_sleep(1.8); END IF;
  IF v_mode='stall_once' AND v_attempt=6 THEN PERFORM pg_sleep(15); END IF;
  INSERT INTO runner_probe.ticks VALUES (
    v_attempt,pg_backend_pid(),pg_current_xact_id(),v_started,
    transaction_timestamp(),statement_timestamp(),current_setting('statement_timeout'),clock_timestamp()
  );
  IF v_mode='fail_once' AND v_attempt=6 THEN
    RAISE EXCEPTION 'runner_fixture:injected_failure';
  END IF;
  RETURN jsonb_build_object('outcome','completed');
END;
$fixture$;
REVOKE ALL ON FUNCTION private.advance_due_game_state() FROM PUBLIC,anon,authenticated,service_role;
