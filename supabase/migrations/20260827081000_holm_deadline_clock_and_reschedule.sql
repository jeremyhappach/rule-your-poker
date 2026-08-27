-- Holm deadline liveness hardening.
--
-- The canonical timer selector uses clock_timestamp(), but the Holm adapter
-- compared against transaction-stable now(). A worker transaction that began
-- just before a deadline could select the timer just after it was due, receive
-- deadline_not_expired, and then mark the only timer completed. Use the wall
-- clock consistently and make the defensive early outcome reschedulable.

DO $migration$
DECLARE
  v_definition text;
  v_old_guard text := 'v_round.decision_deadline > now()';
  v_new_guard text := 'v_round.decision_deadline > clock_timestamp()';
  v_old_return text := 'RETURN jsonb_build_object(''deadline_not_expired'', true);';
  v_new_return text := 'RETURN jsonb_build_object(''outcome'', ''deadline_not_expired'', ''deadline_not_expired'', true, ''deadline'', v_round.decision_deadline);';
BEGIN
  SELECT pg_get_functiondef(
    'public.holm_apply_deadline_decision(uuid,uuid,uuid,text,boolean)'::regprocedure
  ) INTO v_definition;

  IF position(v_new_guard IN v_definition) = 0 THEN
    IF position(v_old_guard IN v_definition) = 0 THEN
      RAISE EXCEPTION 'holm_deadline_clock:guard_shape_changed';
    END IF;
    v_definition := replace(v_definition, v_old_guard, v_new_guard);
  END IF;

  IF position('''outcome'', ''deadline_not_expired''' IN v_definition) = 0 THEN
    IF position(v_old_return IN v_definition) = 0 THEN
      RAISE EXCEPTION 'holm_deadline_clock:return_shape_changed';
    END IF;
    v_definition := replace(v_definition, v_old_return, v_new_return);
  END IF;

  EXECUTE v_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_old_outcomes text := 'IF v_result->>''outcome'' IN (''pending'',''paused'',''not_prepared'',''no_eligible_players'') THEN';
  v_new_outcomes text := 'IF v_result->>''outcome'' IN (''pending'',''paused'',''not_prepared'',''no_eligible_players'',''deadline_not_expired'') THEN';
  v_old_due text := 'WHEN v_result->>''outcome''=''pending''';
  v_new_due text := 'WHEN v_result->>''outcome'' IN (''pending'',''deadline_not_expired'')';
BEGIN
  SELECT pg_get_functiondef(
    'private.advance_due_canonical_game_timers(integer)'::regprocedure
  ) INTO v_definition;

  IF position('''deadline_not_expired'') THEN' IN v_definition) = 0 THEN
    IF position(v_old_outcomes IN v_definition) = 0 THEN
      RAISE EXCEPTION 'holm_deadline_clock:timer_outcome_shape_changed';
    END IF;
    v_definition := replace(v_definition, v_old_outcomes, v_new_outcomes);
  END IF;

  IF position(v_new_due IN v_definition) = 0 THEN
    IF position(v_old_due IN v_definition) = 0 THEN
      RAISE EXCEPTION 'holm_deadline_clock:timer_due_shape_changed';
    END IF;
    v_definition := replace(v_definition, v_old_due, v_new_due);
  END IF;

  EXECUTE v_definition;
END;
$migration$;

COMMENT ON FUNCTION public.holm_apply_deadline_decision(uuid,uuid,uuid,text,boolean) IS
  'Service-only exact Holm deadline adapter. Uses wall-clock expiry and returns a reschedulable deadline when invoked early.';
