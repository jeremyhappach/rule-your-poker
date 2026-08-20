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

  -- Complete scheduled owner: this executes every complete recovery function,
  -- including session abandonment, through the production dispatcher.
  v_tick := private.advance_due_game_state();
  IF v_tick->>'outcome' <> 'completed'
     OR coalesce((v_tick->>'failure_count')::integer, -1) <> 0
     OR jsonb_array_length(v_tick->'tasks') NOT IN (5, 7) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:complete_tick_failed:%', v_tick;
  END IF;

  -- Immediate replay is safe and does not rerun five-second owners.
  v_replay := private.advance_due_game_state();
  IF v_replay->>'outcome' <> 'completed'
     OR coalesce((v_replay->>'failure_count')::integer, -1) <> 0
     OR coalesce((v_replay->>'ran_five_second_tasks')::boolean, true)
     OR jsonb_array_length(v_replay->'tasks') <> 5 THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:replay_failed:%', v_replay;
  END IF;

  IF EXISTS (SELECT 1 FROM private.game_recovery_failures) THEN
    RAISE EXCEPTION 'game_recovery_scheduler_proof:unexpected_active_failure';
  END IF;
END
$proof$;
