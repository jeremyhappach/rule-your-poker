-- Serialize the platform recovery owners behind one non-overlapping tick.
-- Independent one-second pg_cron jobs can all start together and exhaust the
-- small Postgres/PostgREST pool when any one owner runs long.  Each task keeps
-- its own exception boundary and durable failure state so one broken recovery
-- path cannot roll back or hide successful recovery for every other game.

CREATE TABLE IF NOT EXISTS private.game_recovery_failures (
  task_name text PRIMARY KEY,
  first_failed_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  failure_count bigint NOT NULL DEFAULT 1 CHECK (failure_count > 0),
  returned_sqlstate text NOT NULL,
  error_message text NOT NULL,
  error_detail text,
  error_hint text,
  error_context text,
  last_reported_at timestamptz
);

CREATE TABLE IF NOT EXISTS private.game_recovery_dispatch_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_five_second_at timestamptz
);

INSERT INTO private.game_recovery_dispatch_state(singleton, last_five_second_at)
VALUES (true, NULL)
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON TABLE private.game_recovery_failures
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.game_recovery_dispatch_state
  FROM PUBLIC, anon, authenticated;

-- This private SECURITY DEFINER owner is the scheduled admission boundary for
-- real-money session abandonment.  The 3-5-7 authority trigger remains strict;
-- the trusted context exists only for the duration of this exact server-owned
-- reconciliation transaction and errors still propagate to the task runner.
CREATE OR REPLACE FUNCTION private.reconcile_abandoned_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_watch record;
  v_processed integer := 0;
BEGIN
  PERFORM set_config(
    'app.three_five_seven_authoritative_write',
    'on',
    true
  );

  FOR v_watch IN
    SELECT watch.game_id
      FROM private.session_abandonment_watches AS watch
     WHERE watch.next_check_at <= clock_timestamp()
     ORDER BY watch.next_check_at, watch.game_id
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM private.reconcile_session_abandonment(
      v_watch.game_id,
      clock_timestamp()
    );
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$function$;

CREATE OR REPLACE FUNCTION private.run_due_game_recovery_task(p_task_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
  v_failure_count bigint;
  v_last_reported_at timestamptz;
BEGIN
  CASE p_task_name
    WHEN 'holm' THEN
      PERFORM private.release_due_holm_presentations();
    WHEN 'cribbage' THEN
      PERFORM private.advance_due_cribbage_state();
    WHEN 'gin_rummy' THEN
      PERFORM private.advance_due_gin_rummy_state();
    WHEN 'yahtzee' THEN
      PERFORM private.advance_due_yahtzee_state();
    WHEN 'three_five_seven' THEN
      PERFORM private.advance_due_three_five_seven_state();
    WHEN 'horses_scc' THEN
      PERFORM private.enforce_horses_scc_deadlines();
    WHEN 'session_abandonment' THEN
      PERFORM private.reconcile_abandoned_sessions();
    ELSE
      RAISE EXCEPTION 'run_due_game_recovery_task:unknown_task:%', p_task_name;
  END CASE;

  -- A recovered task clears its one-row active failure claim.  No row is
  -- written on ordinary successful ticks.
  DELETE FROM private.game_recovery_failures
   WHERE task_name = p_task_name;

  RETURN jsonb_build_object('task', p_task_name, 'outcome', 'completed');
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_sqlstate = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL,
    v_hint = PG_EXCEPTION_HINT,
    v_context = PG_EXCEPTION_CONTEXT;

  INSERT INTO private.game_recovery_failures(
    task_name,
    first_failed_at,
    last_failed_at,
    failure_count,
    returned_sqlstate,
    error_message,
    error_detail,
    error_hint,
    error_context
  ) VALUES (
    p_task_name,
    v_now,
    v_now,
    1,
    v_sqlstate,
    v_message,
    nullif(v_detail, ''),
    nullif(v_hint, ''),
    nullif(v_context, '')
  )
  ON CONFLICT (task_name) DO UPDATE
    SET last_failed_at = EXCLUDED.last_failed_at,
        failure_count = private.game_recovery_failures.failure_count + 1,
        returned_sqlstate = EXCLUDED.returned_sqlstate,
        error_message = EXCLUDED.error_message,
        error_detail = EXCLUDED.error_detail,
        error_hint = EXCLUDED.error_hint,
        error_context = EXCLUDED.error_context
  RETURNING failure_count, last_reported_at
       INTO v_failure_count, v_last_reported_at;

  -- Rate-limit PostgreSQL warnings while preserving every occurrence in the
  -- durable counter above.
  IF v_last_reported_at IS NULL
     OR v_last_reported_at <= v_now - interval '1 minute' THEN
    UPDATE private.game_recovery_failures
       SET last_reported_at = v_now
     WHERE task_name = p_task_name;
    RAISE WARNING 'game recovery task % failed [%]: %',
      p_task_name, v_sqlstate, v_message;
  END IF;

  RETURN jsonb_build_object(
    'task', p_task_name,
    'outcome', 'failed',
    'sqlstate', v_sqlstate,
    'message', v_message,
    'failure_count', v_failure_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.advance_due_game_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_last_five_second_at timestamptz;
  v_run_five_second boolean := false;
  v_task text;
  v_task_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_failures integer := 0;
BEGIN
  -- One lock covers cron, manual recovery, and a deployment cutover tick.
  IF NOT pg_try_advisory_xact_lock(357357, 20260820) THEN
    RETURN jsonb_build_object(
      'outcome', 'skipped_locked',
      'started_at', v_started_at
    );
  END IF;

  SELECT last_five_second_at
    INTO v_last_five_second_at
    FROM private.game_recovery_dispatch_state
   WHERE singleton = true
   FOR UPDATE;

  IF v_last_five_second_at IS NULL
     OR v_last_five_second_at <= v_started_at - interval '5 seconds' THEN
    v_run_five_second := true;
    UPDATE private.game_recovery_dispatch_state
       SET last_five_second_at = v_started_at
     WHERE singleton = true;
  END IF;

  FOREACH v_task IN ARRAY ARRAY[
    'holm',
    'cribbage',
    'gin_rummy',
    'yahtzee',
    'three_five_seven'
  ]::text[]
  LOOP
    v_task_result := private.run_due_game_recovery_task(v_task);
    v_results := v_results || jsonb_build_array(v_task_result);
    IF v_task_result->>'outcome' = 'failed' THEN
      v_failures := v_failures + 1;
    END IF;
  END LOOP;

  IF v_run_five_second THEN
    FOREACH v_task IN ARRAY ARRAY[
      'horses_scc',
      'session_abandonment'
    ]::text[]
    LOOP
      v_task_result := private.run_due_game_recovery_task(v_task);
      v_results := v_results || jsonb_build_array(v_task_result);
      IF v_task_result->>'outcome' = 'failed' THEN
        v_failures := v_failures + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_failures = 0 THEN 'completed' ELSE 'partial_failure' END,
    'started_at', v_started_at,
    'finished_at', clock_timestamp(),
    'ran_five_second_tasks', v_run_five_second,
    'failure_count', v_failures,
    'tasks', v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.reconcile_abandoned_sessions()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.run_due_game_recovery_task(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.advance_due_game_state()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.reconcile_abandoned_sessions()
  TO service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_game_state()
  TO service_role;

DO $schedule$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
      FROM cron.job
     WHERE jobname IN (
       'reconcile-abandoned-real-money-sessions',
       'enforce-horses-scc-deadlines-5s',
       'release-due-holm-presentations-1s',
       'advance-due-cribbage-state-1s',
       'advance-due-gin-rummy-state-1s',
       'advance-due-yahtzee-state-1s',
       'advance-due-three-five-seven-state-1s',
       'advance-due-game-state-1s'
     )
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'advance-due-game-state-1s',
    '1 second',
    $cron$SELECT private.advance_due_game_state();$cron$
  );
END
$schedule$;

COMMENT ON FUNCTION private.advance_due_game_state() IS
  'Single non-overlapping scheduled recovery owner for all games. Runs complete game recovery functions sequentially with isolated, durable failure reporting.';
