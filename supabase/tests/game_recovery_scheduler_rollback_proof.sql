-- Caller-owned transaction. Run with the candidate migration loaded before
-- deployment and again against the deployed schema after migration.
-- This invokes the complete scheduled recovery function, not only helpers.

DO $proof$
DECLARE
  v_tick jsonb;
  v_replay jsonb;
  v_injected jsonb;
  v_count integer;
  v_command text;
  v_cursor_before integer;
  v_cursor_after integer;
  v_safety_task text;
  v_replay_safety_task text;
BEGIN
  SELECT count(*), max(command)
    INTO v_count, v_command
    FROM cron.job
   WHERE active
     AND jobname IN (
       'reconcile-abandoned-real-money-sessions',
       'enforce-horses-scc-deadlines-5s',
       'release-due-holm-presentations-1s',
       'advance-due-cribbage-state-1s',
       'advance-due-gin-rummy-state-1s',
       'advance-due-yahtzee-state-1s',
       'advance-due-three-five-seven-state-1s',
       'advance-due-game-state-1s'
     );

  IF v_count <> 1
     OR v_command IS DISTINCT FROM 'SELECT private.advance_due_game_state();' THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:unexpected_active_jobs:%:%',
      v_count, v_command;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM cron.job
     WHERE active
       AND jobname = 'advance-due-game-state-1s'
       AND schedule = '1 second'
  ) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:dispatcher_schedule_missing';
  END IF;

  -- Prove the exact task boundary throws, handles, persists, and reports a
  -- failure without aborting the caller transaction.
  v_injected := private.run_due_game_recovery_task('__rollback_proof_failure__');
  IF v_injected->>'outcome' <> 'failed'
     OR NOT EXISTS (
       SELECT 1
         FROM private.game_recovery_failures
        WHERE task_name = '__rollback_proof_failure__'
          AND failure_count = 1
          AND returned_sqlstate = 'P0001'
     ) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:failure_not_durable:%',
      v_injected;
  END IF;
  DELETE FROM private.game_recovery_failures
   WHERE task_name = '__rollback_proof_failure__';

  IF has_function_privilege(
       'anon',
       'private.game_recovery_task_is_due(text,timestamptz)',
       'EXECUTE'
     ) OR has_function_privilege(
       'authenticated',
       'private.game_recovery_task_is_due(text,timestamptz)',
       'EXECUTE'
     ) OR NOT has_function_privilege(
       'service_role',
       'private.game_recovery_task_is_due(text,timestamptz)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:admission_permissions';
  END IF;

  SELECT safety_cursor INTO v_cursor_before
    FROM private.game_recovery_dispatch_state
   WHERE singleton = true;

  -- Serialize the caller-owned proof with the live cron tick. The dispatcher
  -- uses the same transaction lock, so its acquisition below is re-entrant.
  PERFORM pg_advisory_xact_lock(357357, 20260820);

  -- Exact due work and one rotating full-safety owner share the same
  -- non-overlapping dispatcher. Production may already contain due work, so
  -- the proof checks bounded shape rather than assuming an idle database.
  v_tick := private.advance_due_game_state();
  IF v_tick->>'outcome' <> 'completed'
     OR coalesce((v_tick->>'failure_count')::integer, -1) <> 0
     OR jsonb_array_length(v_tick->'tasks') NOT BETWEEN 1 AND 8
     OR nullif(v_tick->>'safety_task', '') IS NULL
     OR coalesce((v_tick->>'skipped_task_count')::integer, -1) NOT BETWEEN 0 AND 7
     OR coalesce((v_tick->>'ran_five_second_tasks')::boolean, true) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:complete_tick_failed:%', v_tick;
  END IF;
  v_safety_task := v_tick->>'safety_task';
  IF NOT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_tick->'tasks') task_result
     WHERE task_result->>'task' = v_safety_task
  ) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:safety_task_not_run:%', v_tick;
  END IF;

  -- Immediate replay is safe and advances to the next full-safety owner.
  v_replay := private.advance_due_game_state();
  IF v_replay->>'outcome' <> 'completed'
     OR coalesce((v_replay->>'failure_count')::integer, -1) <> 0
     OR coalesce((v_replay->>'ran_five_second_tasks')::boolean, true)
     OR jsonb_array_length(v_replay->'tasks') NOT BETWEEN 1 AND 8
     OR nullif(v_replay->>'safety_task', '') IS NULL THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:replay_failed:%', v_replay;
  END IF;
  v_replay_safety_task := v_replay->>'safety_task';
  IF v_replay_safety_task = v_safety_task THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:safety_cursor_stalled:%:%',
      v_safety_task, v_replay_safety_task;
  END IF;

  SELECT safety_cursor INTO v_cursor_after
    FROM private.game_recovery_dispatch_state
   WHERE singleton = true;
  IF v_cursor_after <> (coalesce(v_cursor_before, 0) + 2) % 8 THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:unexpected_cursor:%:%',
      v_cursor_before, v_cursor_after;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM private.game_recovery_dispatch_state dispatch
     WHERE dispatch.singleton = true
       AND dispatch.last_completed_at IS NOT NULL
       AND dispatch.last_outcome = 'completed'
       AND dispatch.last_safety_task = v_replay_safety_task
       AND dispatch.last_safety_task_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:dispatch_state_not_published';
  END IF;

  IF EXISTS (SELECT 1 FROM private.game_recovery_failures) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:unexpected_active_failure';
  END IF;
END
$proof$;
