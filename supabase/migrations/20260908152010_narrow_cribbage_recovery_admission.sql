-- Narrow current Cribbage round identities before inspecting private JSON.
-- The materialized identity boundary prevents an optimizer push-down from
-- scanning/decompressing historical hand payloads every second. CASE evaluates
-- the phase once. All due conditions, other owners, cadence and safety sweeps
-- remain unchanged; no game, settlement, timer or financial data is mutated.

CREATE OR REPLACE FUNCTION private.game_recovery_task_is_due(p_task_name text, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
        WITH current_rounds AS MATERIALIZED (
          SELECT round_row.id, round_row.game_id, round_row.presentation_fallback_at, game_row.status AS game_status
          FROM public.games game_row
          JOIN public.rounds round_row ON round_row.game_id=game_row.id
            AND round_row.dealer_game_id=game_row.current_game_uuid
            AND round_row.hand_number=game_row.total_hands
          WHERE game_row.game_type='cribbage' AND NOT coalesce(game_row.is_paused,false)
        )
        SELECT 1 FROM current_rounds round_row
        JOIN private.cribbage_round_states authority ON authority.round_id=round_row.id
        WHERE CASE authority.state ->> 'phase'
          WHEN 'discarding' THEN EXISTS (
            SELECT 1 FROM public.players participant
            WHERE participant.game_id = round_row.game_id
              AND coalesce(participant.is_bot, false)
              AND authority.state -> 'playerStates' ? participant.id::text
              AND jsonb_array_length(coalesce(
                authority.state -> 'playerStates' -> participant.id::text -> 'discardedToCrib',
                '[]'::jsonb
              )) = 0
          )
          WHEN 'pegging' THEN EXISTS (
            SELECT 1 FROM public.players participant
            WHERE participant.id = nullif(
              authority.state -> 'pegging' ->> 'currentTurnPlayerId', ''
            )::uuid
              AND participant.game_id = round_row.game_id
              AND coalesce(participant.is_bot, false)
          )
          WHEN 'counting' THEN
            authority.state -> 'countingResolution' ->> 'outcome' IN ('ready', 'terminal_pending')
            AND round_row.presentation_fallback_at <= p_now
          WHEN 'complete' THEN round_row.game_status NOT IN ('game_over', 'session_ended')
          ELSE false
        END
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
