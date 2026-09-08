-- DESIGN PROOF ONLY. Submit this single DO statement without an outer BEGIN.
-- Never invoke a gameplay mutator or change cron. All writes target pg_temp.
-- A successful result is [] with no SQL error; assertions fail closed.
DO $recovery_reuse_proof$
DECLARE
  v_report jsonb := '[]'::jsonb;
  v_count integer;
  v_min_gap numeric;
  v_max_gap numeric;
BEGIN
  EXECUTE $definition$
    CREATE PROCEDURE pg_temp.recovery_reuse_probe(INOUT p_report jsonb)
    LANGUAGE plpgsql SECURITY INVOKER
    AS $procedure$
    DECLARE
      v_tick integer;
      v_started timestamptz;
      v_finished timestamptz;
      v_xid xid8;
      v_due jsonb;
      v_delay double precision;
      v_sleep_ended timestamptz;
    BEGIN
      FOR v_tick IN 1..12 LOOP
        v_started := pg_catalog.clock_timestamp();
        IF v_sleep_ended IS NOT NULL AND pg_catalog.transaction_timestamp()<v_sleep_ended THEN
          RAISE EXCEPTION 'reuse_proof:sleep_transaction_carried_into_tick';
        END IF;
        v_xid := pg_catalog.pg_current_xact_id();
        PERFORM pg_catalog.pg_advisory_xact_lock(987654,20260908);
        PERFORM pg_catalog.set_config('reuse_probe.local_context','present',true);
        SELECT pg_catalog.jsonb_object_agg(task,
          private.game_recovery_task_is_due(task,v_started)) INTO v_due
        FROM pg_catalog.unnest(ARRAY[
          'canonical_timers','holm','cribbage','gin_rummy','yahtzee',
          'three_five_seven','horses_scc','session_abandonment'
        ]) AS tasks(task);
        v_finished := pg_catalog.clock_timestamp();
        COMMIT;

        IF nullif(pg_catalog.current_setting('reuse_probe.local_context',true),'') IS NOT NULL THEN
          RAISE EXCEPTION 'reuse_proof:local_context_leaked';
        END IF;
        IF EXISTS(SELECT 1 FROM pg_catalog.pg_locks
          WHERE pid=pg_catalog.pg_backend_pid() AND locktype='advisory'
            AND classid=987654 AND objid=20260908) THEN
          RAISE EXCEPTION 'reuse_proof:transaction_lock_leaked';
        END IF;
        p_report := p_report || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('tick',v_tick,'xid',v_xid::text,
            'started_at',v_started,'finished_at',v_finished,'due',v_due));
        -- Anchor to this actual tick, never replay missed time slots in a burst.
        v_delay := greatest(0,1-extract(epoch FROM
          (pg_catalog.clock_timestamp()-v_started)));
        PERFORM pg_catalog.pg_sleep(v_delay);
        v_sleep_ended := pg_catalog.clock_timestamp();
        -- Sleep has its own transaction; don't carry its timestamp into work.
        COMMIT;
      END LOOP;
    END;
    $procedure$;
  $definition$;
  COMMIT;
  CALL pg_temp.recovery_reuse_probe(v_report);

  IF jsonb_array_length(v_report)<>12 THEN
    RAISE EXCEPTION 'reuse_proof:wrong_tick_count';
  END IF;
  SELECT count(DISTINCT entry->>'xid') INTO v_count
    FROM jsonb_array_elements(v_report) entry;
  IF v_count<>12 THEN RAISE EXCEPTION 'reuse_proof:transactions_reused'; END IF;
  SELECT min(gap),max(gap) INTO v_min_gap,v_max_gap FROM (
    SELECT extract(epoch FROM ((entry->>'started_at')::timestamptz-
      lag((entry->>'started_at')::timestamptz) OVER (ORDER BY ordinal))) AS gap
    FROM jsonb_array_elements(v_report) WITH ORDINALITY AS rows(entry,ordinal)
  ) gaps;
  IF v_min_gap<0.95 OR v_max_gap>1.5 THEN
    RAISE EXCEPTION 'reuse_proof:cadence_outside_budget:min=%,max=%',v_min_gap,v_max_gap;
  END IF;

  -- Generic transaction fixtures, NOT a game/settlement proof.
  CREATE TEMP TABLE reuse_probe_commits(id integer PRIMARY KEY) ON COMMIT PRESERVE ROWS;
  INSERT INTO pg_temp.reuse_probe_commits VALUES (1);
  COMMIT;
  INSERT INTO pg_temp.reuse_probe_commits VALUES (2);
  ROLLBACK;
  SELECT count(*) INTO v_count FROM pg_temp.reuse_probe_commits;
  IF v_count<>1 OR NOT EXISTS(SELECT 1 FROM pg_temp.reuse_probe_commits WHERE id=1) THEN
    RAISE EXCEPTION 'reuse_proof:rollback_lost_prior_commit';
  END IF;
  INSERT INTO pg_temp.reuse_probe_commits VALUES (1) ON CONFLICT DO NOTHING;
  COMMIT;
  SELECT count(*) INTO v_count FROM pg_temp.reuse_probe_commits;
  IF v_count<>1 THEN RAISE EXCEPTION 'reuse_proof:fixture_replay_duplicated'; END IF;

  DROP TABLE pg_temp.reuse_probe_commits;
  DROP PROCEDURE pg_temp.recovery_reuse_probe(jsonb);
  COMMIT;
END;
$recovery_reuse_proof$;
