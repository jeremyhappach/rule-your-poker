-- Keep the single one-second recovery heartbeat, but admit only exact due work
-- plus one rotating full-safety owner per tick. This prevents an idle tick from
-- invoking every game recovery function while preserving bounded recovery for
-- fake-money, disconnected, stale-heartbeat, legacy, and postgame states.

ALTER TABLE private.game_recovery_dispatch_state
  ADD COLUMN IF NOT EXISTS safety_cursor integer NOT NULL DEFAULT 0
    CHECK (safety_cursor BETWEEN 0 AND 7),
  ADD COLUMN IF NOT EXISTS last_safety_task_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_safety_task text;

CREATE INDEX IF NOT EXISTS idx_games_recovery_admission
  ON public.games (game_type, status, id)
  WHERE status IN (
    'cribbage_dealer_selection',
    'ante_decision',
    'in_progress',
    'game_over',
    'session_ended'
  );

CREATE OR REPLACE FUNCTION private.game_recovery_task_is_due(
  p_task_name text,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_due boolean := false;
BEGIN
  CASE p_task_name
    WHEN 'canonical_timers' THEN
      SELECT EXISTS (
        SELECT 1
          FROM private.game_timer_registry timer
          JOIN public.games game_row ON game_row.id = timer.game_id
         WHERE timer.owner_task = 'canonical_timers'
           AND timer.state = 'scheduled'
           AND timer.due_at <= p_now
           AND NOT coalesce(game_row.is_paused, false)
      ) INTO v_due;

    WHEN 'holm' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.rounds successor
          JOIN public.games game_row ON game_row.id = successor.game_id
         WHERE successor.status = 'dealing'
           AND successor.holm_predecessor_round_id IS NOT NULL
           AND successor.presentation_fallback_at IS NOT NULL
           AND (
             successor.presentation_fallback_at <= p_now
             OR private.holm_prepared_hand_actor_acknowledged(successor.id)
           )
           AND game_row.game_type IN ('holm', 'holm-game')
           AND game_row.awaiting_next_round = true
           AND game_row.status NOT IN ('game_over', 'session_ended')
           AND NOT coalesce(game_row.is_paused, false)
      ) INTO v_due;

    WHEN 'cribbage' THEN
      SELECT EXISTS (
        SELECT 1
          FROM private.game_timer_registry timer
          JOIN public.games game_row ON game_row.id = timer.game_id
         WHERE timer.owner_task = 'cribbage'
           AND timer.state = 'scheduled'
           AND timer.due_at <= p_now
           AND NOT coalesce(game_row.is_paused, false)
      ) OR EXISTS (
        SELECT 1
          FROM public.games game_row
         WHERE game_row.game_type = 'cribbage'
           AND game_row.status = 'cribbage_dealer_selection'
           AND game_row.dealer_selection_state ->> 'isComplete' = 'true'
           AND nullif(
                 game_row.dealer_selection_state ->> 'preparedAt',
                 ''
               )::timestamptz <= p_now - interval '5 seconds'
      ) OR EXISTS (
        SELECT 1
          FROM private.cribbage_round_states authority
          JOIN public.rounds round_row ON round_row.id = authority.round_id
          JOIN public.games game_row ON game_row.id = round_row.game_id
         WHERE game_row.game_type = 'cribbage'
           AND game_row.current_game_uuid = round_row.dealer_game_id
           AND game_row.total_hands = round_row.hand_number
           AND NOT coalesce(game_row.is_paused, false)
           AND (
             (
               authority.state ->> 'phase' = 'discarding'
               AND EXISTS (
                 SELECT 1
                   FROM public.players participant
                  WHERE participant.game_id = round_row.game_id
                    AND coalesce(participant.is_bot, false)
                    AND authority.state -> 'playerStates' ? participant.id::text
                    AND jsonb_array_length(coalesce(
                          authority.state -> 'playerStates' -> participant.id::text -> 'discardedToCrib',
                          '[]'::jsonb
                        )) = 0
               )
             )
             OR (
               authority.state ->> 'phase' = 'pegging'
               AND EXISTS (
                 SELECT 1
                   FROM public.players participant
                  WHERE participant.id = nullif(
                          authority.state -> 'pegging' ->> 'currentTurnPlayerId',
                          ''
                        )::uuid
                    AND participant.game_id = round_row.game_id
                    AND coalesce(participant.is_bot, false)
               )
             )
             OR (
               authority.state ->> 'phase' = 'counting'
               AND authority.state -> 'countingResolution' ->> 'outcome'
                     IN ('ready', 'terminal_pending')
               AND round_row.presentation_fallback_at <= p_now
             )
             OR (
               authority.state ->> 'phase' = 'complete'
               AND game_row.status NOT IN ('game_over', 'session_ended')
             )
           )
      ) INTO v_due;

    WHEN 'gin_rummy' THEN
      SELECT EXISTS (
        SELECT 1
          FROM private.gin_rummy_round_states authority
          JOIN public.rounds round_row ON round_row.id = authority.round_id
          JOIN public.games game_row ON game_row.id = round_row.game_id
         WHERE game_row.game_type = 'gin-rummy'
           AND game_row.status = 'in_progress'
           AND game_row.current_game_uuid = round_row.dealer_game_id
           AND game_row.total_hands = round_row.hand_number
           AND NOT coalesce(game_row.is_paused, false)
           AND (
             (
               authority.state ->> 'phase' = 'scoring'
               AND coalesce(
                     (authority.state ->> 'scoringDueAt')::timestamptz,
                     authority.updated_at + interval '4 seconds'
                   ) <= p_now
             )
             OR (
               authority.state ->> 'phase' = 'complete'
               AND coalesce(
                     (authority.state ->> 'completeDueAt')::timestamptz,
                     authority.updated_at + interval '5 seconds'
                   ) <= p_now
             )
             OR (
               authority.state ->> 'phase'
                 IN ('first_draw', 'playing', 'knocking', 'laying_off')
               AND coalesce(
                     (authority.state ->> 'botActionDueAt')::timestamptz,
                     authority.updated_at + interval '1 second'
                   ) <= p_now
               AND EXISTS (
                 SELECT 1
                   FROM public.players participant
                  WHERE participant.id = nullif(
                          authority.state ->> 'currentTurnPlayerId',
                          ''
                        )::uuid
                    AND participant.is_bot
               )
             )
           )
      ) INTO v_due;

    WHEN 'yahtzee' THEN
      SELECT EXISTS (
        SELECT 1
          FROM private.game_timer_registry timer
          JOIN public.games game_row ON game_row.id = timer.game_id
         WHERE timer.owner_task = 'yahtzee'
           AND timer.state = 'scheduled'
           AND timer.due_at <= p_now
           AND NOT coalesce(game_row.is_paused, false)
      ) OR EXISTS (
        SELECT 1
          FROM public.games game_row
         WHERE game_row.game_type = 'yahtzee'
           AND game_row.status = 'ante_decision'
           AND game_row.current_game_uuid IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
               FROM public.players participant
              WHERE participant.game_id = game_row.id
                AND NOT coalesce(participant.sitting_out, false)
                AND participant.status NOT IN ('observer', 'left')
                AND participant.ante_decision IS NULL
           )
      ) OR EXISTS (
        SELECT 1
          FROM public.rounds round_row
          JOIN public.games game_row ON game_row.id = round_row.game_id
         WHERE game_row.game_type = 'yahtzee'
           AND game_row.status = 'in_progress'
           AND NOT coalesce(game_row.is_paused, false)
           AND round_row.dealer_game_id = game_row.current_game_uuid
           AND round_row.hand_number = game_row.total_hands
           AND (
             (
               game_row.awaiting_next_round
               AND round_row.status = 'completed'
             )
             OR (
               round_row.status = 'betting'
               AND round_row.yahtzee_state ->> 'gamePhase' = 'complete'
             )
           )
      ) OR EXISTS (
        SELECT 1
          FROM public.games game_row
         WHERE game_row.game_type = 'yahtzee'
           AND game_row.status = 'game_over'
           AND game_row.current_game_uuid IS NOT NULL
           AND game_row.game_over_at <= p_now - interval '30 seconds'
      ) INTO v_due;

    WHEN 'three_five_seven' THEN
      SELECT EXISTS (
        SELECT 1
          FROM private.game_timer_registry timer
          JOIN public.games game_row ON game_row.id = timer.game_id
         WHERE timer.owner_task = 'three_five_seven'
           AND timer.state = 'scheduled'
           AND timer.due_at <= p_now
           AND NOT coalesce(game_row.is_paused, false)
      ) OR EXISTS (
        SELECT 1
          FROM public.games game_row
         WHERE game_row.game_type IN ('3-5-7', '3-5-7-game', '357')
           AND game_row.status = 'ante_decision'
           AND NOT coalesce(game_row.is_paused, false)
           AND 2 <= (
             SELECT count(*)
               FROM public.players participant
              WHERE participant.game_id = game_row.id
                AND participant.status NOT IN ('left', 'observer')
                AND NOT coalesce(participant.sitting_out, false)
           )
           AND NOT EXISTS (
             SELECT 1
               FROM public.players participant
              WHERE participant.game_id = game_row.id
                AND participant.status NOT IN ('left', 'observer')
                AND NOT coalesce(participant.sitting_out, false)
                AND participant.ante_decision IS DISTINCT FROM 'ante_up'
           )
      ) OR EXISTS (
        SELECT 1
          FROM public.games game_row
          JOIN public.rounds round_row
            ON round_row.game_id = game_row.id
           AND round_row.dealer_game_id = game_row.current_game_uuid
           AND round_row.hand_number = game_row.total_hands
           AND round_row.round_number = game_row.current_round
         WHERE game_row.game_type IN ('3-5-7', '3-5-7-game', '357')
           AND game_row.status = 'in_progress'
           AND NOT coalesce(game_row.is_paused, false)
           AND round_row.status = 'betting'
           AND (
             round_row.decision_deadline <= p_now
             OR EXISTS (
               SELECT 1
                 FROM public.players participant
                WHERE participant.game_id = game_row.id
                  AND coalesce(participant.is_bot, false)
                  AND participant.status NOT IN ('left', 'observer')
                  AND NOT coalesce(participant.sitting_out, false)
                  AND NOT coalesce(participant.decision_locked, false)
             )
             OR NOT EXISTS (
               SELECT 1
                 FROM public.players participant
                WHERE participant.game_id = game_row.id
                  AND participant.status NOT IN ('left', 'observer')
                  AND NOT coalesce(participant.sitting_out, false)
                  AND NOT coalesce(participant.decision_locked, false)
             )
           )
      ) OR EXISTS (
        SELECT 1
          FROM public.games game_row
          JOIN private.three_five_seven_round_resolutions resolution
            ON resolution.game_id = game_row.id
           AND resolution.dealer_game_id = game_row.current_game_uuid
           AND resolution.hand_number = game_row.total_hands
         WHERE game_row.game_type IN ('3-5-7', '3-5-7-game', '357')
           AND game_row.status IN ('in_progress', 'game_over', 'session_ended')
           AND NOT coalesce(game_row.is_paused, false)
           AND resolution.presentation_fallback_at <= p_now
           AND (
             game_row.awaiting_next_round
             OR resolution.outcome IN ('terminal', 'instant_sweep')
           )
      ) INTO v_due;

    WHEN 'horses_scc' THEN
      SELECT EXISTS (
        SELECT 1
          FROM public.rounds round_row
          JOIN public.games game_row ON game_row.id = round_row.game_id
         WHERE game_row.game_type IN ('horses', 'ship-captain-crew')
           AND game_row.status = 'in_progress'
           AND NOT coalesce(game_row.is_paused, false)
           AND game_row.current_game_uuid = round_row.dealer_game_id
           AND game_row.current_round = round_row.round_number
           AND (
             round_row.horses_state ->> 'gamePhase' = 'complete'
             OR (
               round_row.horses_state ->> 'gamePhase' = 'playing'
               AND nullif(
                     round_row.horses_state ->> 'turnDeadline',
                     ''
                   )::timestamptz <= p_now
             )
           )
      ) INTO v_due;

    WHEN 'session_abandonment' THEN
      SELECT EXISTS (
        SELECT 1
          FROM private.session_abandonment_watches watch
         WHERE watch.next_check_at <= p_now
      ) INTO v_due;

    ELSE
      RAISE EXCEPTION 'game_recovery_task_is_due:unknown_task:%', p_task_name;
  END CASE;

  RETURN coalesce(v_due, false);
END;
$function$;

REVOKE ALL ON FUNCTION private.game_recovery_task_is_due(text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.game_recovery_task_is_due(text, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION private.advance_due_game_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_task_order text[] := ARRAY[
    'canonical_timers',
    'holm',
    'cribbage',
    'gin_rummy',
    'yahtzee',
    'three_five_seven',
    'horses_scc',
    'session_abandonment'
  ]::text[];
  v_safety_cursor integer;
  v_safety_task text;
  v_task text;
  v_task_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_failures integer := 0;
  v_due_tasks integer := 0;
  v_skipped_tasks integer := 0;
  v_is_due boolean;
BEGIN
  -- One lock covers cron, manual recovery, and a deployment cutover tick.
  IF NOT pg_try_advisory_xact_lock(357357, 20260820) THEN
    RETURN jsonb_build_object(
      'outcome', 'skipped_locked',
      'started_at', v_started_at
    );
  END IF;

  SELECT safety_cursor
    INTO v_safety_cursor
    FROM private.game_recovery_dispatch_state
   WHERE singleton = true
   FOR UPDATE;

  v_safety_cursor := coalesce(v_safety_cursor, 0);
  v_safety_task := v_task_order[v_safety_cursor + 1];

  UPDATE private.game_recovery_dispatch_state
     SET safety_cursor = (v_safety_cursor + 1) % cardinality(v_task_order),
         last_safety_task_at = v_started_at,
         last_safety_task = v_safety_task
   WHERE singleton = true;

  FOREACH v_task IN ARRAY v_task_order
  LOOP
    -- Admission is an optimization, never a new failure boundary. If an
    -- unexpected legacy row cannot be classified, run that owner and let its
    -- established isolated runner record the authoritative failure.
    BEGIN
      v_is_due := private.game_recovery_task_is_due(v_task, v_started_at);
    EXCEPTION WHEN OTHERS THEN
      v_is_due := true;
    END;
    IF v_is_due THEN
      v_due_tasks := v_due_tasks + 1;
    END IF;

    IF v_is_due OR v_task = v_safety_task THEN
      v_task_result := private.run_due_game_recovery_task(v_task);
      v_results := v_results || jsonb_build_array(v_task_result);
      IF v_task_result ->> 'outcome' <> 'completed' THEN
        v_failures := v_failures + 1;
      END IF;
    ELSE
      v_skipped_tasks := v_skipped_tasks + 1;
    END IF;
  END LOOP;

  UPDATE private.game_recovery_dispatch_state
     SET last_completed_at = clock_timestamp(),
         last_outcome = CASE
           WHEN v_failures = 0 THEN 'completed'
           ELSE 'partial_failure'
         END,
         consecutive_partial_failures = CASE
           WHEN v_failures = 0 THEN 0
           ELSE consecutive_partial_failures + 1
         END,
         last_duration_ms = greatest(
           0,
           round(extract(epoch FROM (
             clock_timestamp() - v_started_at
           )) * 1000)::integer
         )
   WHERE singleton = true;

  RETURN jsonb_build_object(
    'outcome', CASE
      WHEN v_failures = 0 THEN 'completed'
      ELSE 'partial_failure'
    END,
    'started_at', v_started_at,
    'finished_at', clock_timestamp(),
    -- Compatibility field for older diagnostics. Safety is now rotating.
    'ran_five_second_tasks', false,
    'safety_task', v_safety_task,
    'due_task_count', v_due_tasks,
    'skipped_task_count', v_skipped_tasks,
    'failure_count', v_failures,
    'tasks', v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.advance_due_game_state()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.advance_due_game_state()
  TO service_role;

COMMENT ON FUNCTION private.game_recovery_task_is_due(text, timestamptz) IS
  'Cheap exact-state admission for the serialized recovery dispatcher. Due work never depends on browser heartbeat presence.';
COMMENT ON FUNCTION private.advance_due_game_state() IS
  'Single non-overlapping scheduler: exact due owners run immediately and one full safety owner rotates each tick so fake-money, disconnected, and legacy recovery remain bounded without invoking every game task together.';
