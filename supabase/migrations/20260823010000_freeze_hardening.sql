-- Bound each recovery owner so one blocked game path cannot starve every
-- later game, preserve durable slow-task evidence, repair 3-5-7 pause
-- authority, and release prepared Holm hands from the current actor's exact
-- presentation readiness instead of every connected client's cosmetics.

CREATE TABLE IF NOT EXISTS private.game_recovery_slow_task_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_name text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  outcome text NOT NULL CHECK (outcome IN ('completed', 'failed', 'lock_timeout')),
  returned_sqlstate text,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_game_recovery_slow_task_runs_started_at
  ON private.game_recovery_slow_task_runs (started_at DESC);

ALTER TABLE private.game_recovery_slow_task_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.game_recovery_slow_task_runs
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.run_due_game_recovery_task(p_task_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'private'
SET lock_timeout = '750ms'
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_finished_at timestamptz;
  v_duration_ms integer;
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_hint text;
  v_context text;
  v_failure_count bigint;
  v_last_reported_at timestamptz;
  v_outcome text;
BEGIN
  CASE p_task_name
    WHEN 'canonical_timers' THEN
      PERFORM private.advance_due_canonical_game_timers();
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

  DELETE FROM private.game_recovery_failures
   WHERE task_name = p_task_name;

  v_finished_at := clock_timestamp();
  v_duration_ms := greatest(
    0,
    round(extract(epoch FROM (v_finished_at - v_started_at)) * 1000)::integer
  );

  IF v_duration_ms >= 500 THEN
    INSERT INTO private.game_recovery_slow_task_runs(
      task_name, started_at, finished_at, duration_ms, outcome
    ) VALUES (
      p_task_name, v_started_at, v_finished_at, v_duration_ms, 'completed'
    );

    DELETE FROM private.game_recovery_slow_task_runs
     WHERE started_at < clock_timestamp() - interval '14 days';
  END IF;

  RETURN jsonb_build_object(
    'task', p_task_name,
    'outcome', 'completed',
    'duration_ms', v_duration_ms
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_sqlstate = RETURNED_SQLSTATE,
    v_message = MESSAGE_TEXT,
    v_detail = PG_EXCEPTION_DETAIL,
    v_hint = PG_EXCEPTION_HINT,
    v_context = PG_EXCEPTION_CONTEXT;

  v_finished_at := clock_timestamp();
  v_duration_ms := greatest(
    0,
    round(extract(epoch FROM (v_finished_at - v_started_at)) * 1000)::integer
  );
  v_outcome := CASE WHEN v_sqlstate = '55P03' THEN 'lock_timeout' ELSE 'failed' END;

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
    v_started_at,
    v_finished_at,
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

  INSERT INTO private.game_recovery_slow_task_runs(
    task_name, started_at, finished_at, duration_ms, outcome,
    returned_sqlstate, error_message
  ) VALUES (
    p_task_name, v_started_at, v_finished_at, v_duration_ms, v_outcome,
    v_sqlstate, v_message
  );

  DELETE FROM private.game_recovery_slow_task_runs
   WHERE started_at < clock_timestamp() - interval '14 days';

  IF v_last_reported_at IS NULL
     OR v_last_reported_at <= v_finished_at - interval '1 minute' THEN
    UPDATE private.game_recovery_failures
       SET last_reported_at = v_finished_at
     WHERE task_name = p_task_name;
    RAISE WARNING 'game recovery task % failed [%]: %',
      p_task_name, v_sqlstate, v_message;
  END IF;

  RETURN jsonb_build_object(
    'task', p_task_name,
    'outcome', v_outcome,
    'sqlstate', v_sqlstate,
    'message', v_message,
    'failure_count', v_failure_count,
    'duration_ms', v_duration_ms
  );
END;
$function$;

-- Count every isolated task failure, including a deliberately bounded lock
-- wait, while retaining the existing single-worker dispatcher.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'    IF v_task_result->>''outcome'' = ''failed'' THEN\n      v_failures := v_failures + 1;\n    END IF;';
  v_after text := E'    IF v_task_result->>''outcome'' <> ''completed'' THEN\n      v_failures := v_failures + 1;\n    END IF;';
BEGIN
  SELECT pg_get_functiondef('private.advance_due_game_state()'::regprocedure)
    INTO v_definition;

  IF position(v_before IN v_definition) = 0 THEN
    IF position(v_after IN v_definition) = 0 THEN
      RAISE EXCEPTION 'freeze_hardening:advance_due_game_state_shape_changed';
    END IF;
    RETURN;
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END
$migration$;

-- set_game_paused is already the authorized host/admin/service boundary. Give
-- its exact 3-5-7 resume update the same transaction-local authority used by
-- every other database-owned 3-5-7 round mutation.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  UPDATE public.rounds round_row\n     SET decision_deadline=';
  v_after text := E'  -- set_game_paused:357_authority\n  IF v_game.game_type IN (''3-5-7'', ''3-5-7-game'', ''357'') THEN\n    PERFORM set_config(''app.three_five_seven_authoritative_write'', ''on'', true);\n  END IF;\n\n  UPDATE public.rounds round_row\n     SET decision_deadline=';
BEGIN
  SELECT pg_get_functiondef('public.set_game_paused(uuid,boolean)'::regprocedure)
    INTO v_definition;

  IF position('set_game_paused:357_authority' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'freeze_hardening:set_game_paused_shape_changed';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END
$migration$;

CREATE OR REPLACE FUNCTION private.holm_prepared_hand_actor_acknowledged(
  p_successor_round_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce((
    SELECT CASE
      WHEN coalesce(participant.is_bot, false) THEN true
      ELSE EXISTS (
        SELECT 1
          FROM private.holm_hand_presentation_ack_requirements requirement
         WHERE requirement.successor_round_id = successor.id
           AND requirement.player_id = participant.id
           AND requirement.acknowledged_at IS NOT NULL
      )
    END
      FROM public.rounds successor
      JOIN public.players participant
        ON participant.game_id = successor.game_id
       AND participant.position = successor.pending_turn_position
     WHERE successor.id = p_successor_round_id
       AND participant.status = 'active'
       AND coalesce(participant.sitting_out, false) = false
     LIMIT 1
  ), false);
$function$;

REVOKE ALL ON FUNCTION private.holm_prepared_hand_actor_acknowledged(uuid)
  FROM PUBLIC, anon, authenticated;

-- The current actor's exact ready acknowledgement is the gameplay release
-- boundary. Other clients may finish the same immutable presentation locally.
DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  IF p_release_mode = ''acknowledged'' AND EXISTS (\n    SELECT 1\n    FROM private.holm_hand_presentation_ack_requirements requirement\n    WHERE requirement.successor_round_id = p_successor_round_id\n      AND requirement.acknowledged_at IS NULL\n  ) THEN\n    RETURN jsonb_build_object(''outcome'', ''rejected'', ''reason'', ''acknowledgements-pending'');\n  END IF;';
  v_after text := E'  IF p_release_mode = ''acknowledged''\n     AND NOT private.holm_prepared_hand_actor_acknowledged(p_successor_round_id) THEN\n    RETURN jsonb_build_object(''outcome'', ''rejected'', ''reason'', ''current-actor-acknowledgement-pending'');\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(
    'private.activate_prepared_holm_hand_exact(uuid,uuid,uuid,text)'::regprocedure
  ) INTO v_definition;

  IF position('current-actor-acknowledgement-pending' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'freeze_hardening:holm_activation_shape_changed';
  END IF;

  EXECUTE replace(v_definition, v_before, v_after);
END
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_before text := E'  IF v_pending > 0 THEN\n    RETURN jsonb_build_object(\n      ''outcome'', ''acknowledged-waiting'',\n      ''round_id'', p_successor_round_id,\n      ''hand_number'', p_hand_number,\n      ''pending_acknowledgements'', v_pending,\n      ''deduped'', v_was_acknowledged\n    );\n  END IF;';
  v_after text := E'  IF NOT private.holm_prepared_hand_actor_acknowledged(p_successor_round_id) THEN\n    RETURN jsonb_build_object(\n      ''outcome'', ''acknowledged-waiting'',\n      ''round_id'', p_successor_round_id,\n      ''hand_number'', p_hand_number,\n      ''pending_acknowledgements'', v_pending,\n      ''waiting_for_current_actor'', true,\n      ''deduped'', v_was_acknowledged\n    );\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(
    'public.acknowledge_holm_prepared_hand_dealt(uuid,uuid,uuid,uuid,integer)'::regprocedure
  ) INTO v_definition;

  IF position('waiting_for_current_actor' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_before IN v_definition) = 0 THEN
    RAISE EXCEPTION 'freeze_hardening:holm_acknowledgement_shape_changed';
  END IF;

  v_definition := replace(v_definition, v_before, v_after);
  v_definition := replace(
    v_definition,
    E'''pending_acknowledgements'', 0,\n      ''deduped'', v_was_acknowledged',
    E'''pending_acknowledgements'', v_pending,\n      ''deduped'', v_was_acknowledged'
  );
  v_definition := replace(
    v_definition,
    E'''pending_acknowledgements'', 0,\n    ''deduped_acknowledgement'', v_was_acknowledged',
    E'''pending_acknowledgements'', v_pending,\n    ''deduped_acknowledgement'', v_was_acknowledged'
  );
  EXECUTE v_definition;
END
$migration$;

CREATE OR REPLACE FUNCTION private.release_due_holm_presentations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_due record;
  v_result jsonb;
  v_released integer := 0;
  v_release_mode text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('private.release_due_holm_presentations', 0)) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

  FOR v_due IN
    SELECT successor.game_id,
           successor.holm_predecessor_round_id AS predecessor_round_id,
           successor.id AS successor_round_id,
           private.holm_prepared_hand_actor_acknowledged(successor.id) AS actor_acknowledged,
           successor.presentation_fallback_at <= clock_timestamp() AS fallback_due
      FROM public.rounds successor
      JOIN public.games game_row ON game_row.id = successor.game_id
     WHERE successor.status = 'dealing'
       AND successor.holm_predecessor_round_id IS NOT NULL
       AND successor.presentation_fallback_at IS NOT NULL
       AND (
         successor.presentation_fallback_at <= clock_timestamp()
         OR private.holm_prepared_hand_actor_acknowledged(successor.id)
       )
       AND game_row.game_type IN ('holm', 'holm-game')
       AND game_row.awaiting_next_round = true
       AND game_row.status NOT IN ('game_over', 'session_ended')
       AND coalesce(game_row.is_paused, false) = false
     ORDER BY successor.presentation_fallback_at, successor.id
     LIMIT 100
  LOOP
    v_release_mode := CASE
      WHEN v_due.actor_acknowledged THEN 'acknowledged'
      ELSE 'fallback'
    END;
    SELECT private.activate_prepared_holm_hand_exact(
      v_due.game_id,
      v_due.predecessor_round_id,
      v_due.successor_round_id,
      v_release_mode
    ) INTO v_result;

    IF v_result->>'outcome' IN ('activated', 'already-active') THEN
      v_released := v_released + 1;
    END IF;
  END LOOP;

  RETURN v_released;
END;
$function$;

-- Shorten only untouched historical defaults. Explicit operator overrides
-- remain intact, and settlement/financial ownership is unchanged.
UPDATE public.game_defaults
   SET holm_after_tabled_delay_ms = CASE
         WHEN holm_after_tabled_delay_ms = 1500 THEN 500
         ELSE holm_after_tabled_delay_ms
       END,
       holm_pre_chucky_delay_ms = CASE
         WHEN holm_pre_chucky_delay_ms = 1500 THEN 500
         ELSE holm_pre_chucky_delay_ms
       END,
       chucky_second_to_last_delay_seconds = CASE
         WHEN chucky_second_to_last_delay_seconds = 1.5 THEN 0.5
         ELSE chucky_second_to_last_delay_seconds
       END,
       chucky_last_card_delay_seconds = CASE
         WHEN chucky_last_card_delay_seconds = 2 THEN 0.8
         ELSE chucky_last_card_delay_seconds
       END
 WHERE game_type = 'holm';

COMMENT ON TABLE private.game_recovery_slow_task_runs IS
  'Bounded 14-day evidence for recovery tasks that exceeded 500 ms, failed, or exhausted the per-task lock-wait budget.';
COMMENT ON FUNCTION private.run_due_game_recovery_task(text) IS
  'Isolated recovery task runner. A 750 ms lock budget prevents one blocked owner from starving later games and slow/error evidence is durable.';
COMMENT ON FUNCTION private.holm_prepared_hand_actor_acknowledged(uuid) IS
  'True only when the prepared hand current actor is a bot or that exact active human acknowledged the canonical successor deal.';
COMMENT ON FUNCTION public.acknowledge_holm_prepared_hand_dealt(uuid, uuid, uuid, uuid, integer) IS
  'Authenticated exact-identity Holm deal acknowledgement. The current actor releases gameplay; other clients finish immutable cosmetics locally.';
COMMENT ON FUNCTION private.release_due_holm_presentations() IS
  'Activates actor-ready prepared Holm hands or hands whose configurable missing-actor lease expired.';
