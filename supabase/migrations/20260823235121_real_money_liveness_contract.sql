-- Fail closed before a new real-money dealer game commits when the single
-- database recovery owner is not demonstrably healthy. Existing games retain
-- their exact timer/recovery owners; this migration does not advance, pause,
-- or otherwise mutate any game.

ALTER TABLE private.game_recovery_dispatch_state
  ADD COLUMN IF NOT EXISTS last_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outcome text
    CHECK (last_outcome IS NULL OR last_outcome IN ('completed', 'partial_failure')),
  ADD COLUMN IF NOT EXISTS consecutive_partial_failures integer NOT NULL DEFAULT 0
    CHECK (consecutive_partial_failures >= 0),
  ADD COLUMN IF NOT EXISTS last_duration_ms integer
    CHECK (last_duration_ms IS NULL OR last_duration_ms >= 0);

-- Publish a heartbeat only after the complete serialized pass returns. If the
-- dispatcher itself blocks or raises, the previous heartbeat naturally ages
-- out and admission closes without a second scheduler or browser authority.
DO $patch_dispatcher$
DECLARE
  v_definition text;
  v_marker text := E'  RETURN jsonb_build_object(\n    ''outcome'', CASE WHEN v_failures = 0 THEN ''completed'' ELSE ''partial_failure'' END,';
  v_replacement text := E'  UPDATE private.game_recovery_dispatch_state\n     SET last_completed_at = clock_timestamp(),\n         last_outcome = CASE WHEN v_failures = 0 THEN ''completed'' ELSE ''partial_failure'' END,\n         consecutive_partial_failures = CASE WHEN v_failures = 0\n           THEN 0 ELSE consecutive_partial_failures + 1 END,\n         last_duration_ms = greatest(0, round(extract(epoch FROM (clock_timestamp() - v_started_at)) * 1000)::integer)\n   WHERE singleton = true;\n\n' || v_marker;
BEGIN
  SELECT pg_get_functiondef('private.advance_due_game_state()'::regprocedure)
    INTO v_definition;

  IF position('last_completed_at = clock_timestamp()' IN v_definition) > 0 THEN
    RETURN;
  END IF;
  IF position(v_marker IN v_definition) = 0 THEN
    RAISE EXCEPTION 'real_money_liveness_contract:dispatcher_shape_changed';
  END IF;

  EXECUTE replace(v_definition, v_marker, v_replacement);
END
$patch_dispatcher$;

CREATE OR REPLACE FUNCTION private.evaluate_real_money_liveness(
  p_game_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_checked_at timestamptz := clock_timestamp();
  v_game public.games%ROWTYPE;
  v_dispatch private.game_recovery_dispatch_state%ROWTYPE;
  v_failure_tasks text[] := ARRAY[]::text[];
  v_overdue_timers jsonb := '[]'::jsonb;
  v_scheduler_fresh boolean := false;
  v_allowed boolean := false;
  v_reason text := 'scheduler_heartbeat_missing';
BEGIN
  SELECT * INTO v_dispatch
    FROM private.game_recovery_dispatch_state
   WHERE singleton = true;

  v_scheduler_fresh := v_dispatch.last_completed_at IS NOT NULL
    AND v_dispatch.last_completed_at >= v_checked_at - interval '10 seconds'
    AND v_dispatch.last_outcome = 'completed';

  SELECT coalesce(array_agg(failure.task_name ORDER BY failure.task_name), ARRAY[]::text[])
    INTO v_failure_tasks
    FROM private.game_recovery_failures failure;

  IF p_game_id IS NOT NULL THEN
    SELECT * INTO v_game FROM public.games WHERE id = p_game_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'real_money_liveness_health:game_not_found';
    END IF;

    IF NOT coalesce(v_game.real_money, false) THEN
      RETURN jsonb_build_object(
        'outcome', 'healthy',
        'admission_allowed', true,
        'reason', 'fake_money_exempt',
        'checked_at', v_checked_at,
        'game_id', p_game_id,
        'scheduler_last_completed_at', v_dispatch.last_completed_at,
        'scheduler_last_outcome', v_dispatch.last_outcome,
        'active_failure_tasks', to_jsonb(v_failure_tasks),
        'overdue_timers', '[]'::jsonb
      );
    END IF;

    -- Paused games are deliberately outside stagnation admission/evidence.
    -- Their existing scheduled timer rows may remain overdue until resume.
    IF NOT coalesce(v_game.is_paused, false) THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'timer_kind', timer.timer_kind,
               'owner_task', timer.owner_task,
               'phase', timer.phase,
               'seconds_overdue', greatest(
                 0,
                 floor(extract(epoch FROM (v_checked_at - timer.due_at)))::integer
               )
             ) ORDER BY timer.due_at, timer.id), '[]'::jsonb)
        INTO v_overdue_timers
        FROM private.game_timer_registry timer
       WHERE timer.game_id = p_game_id
         AND timer.state = 'scheduled'
         AND timer.due_at < v_checked_at - interval '10 seconds'
         AND (
           timer.dealer_game_id IS NULL
           OR timer.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
         )
         AND (
           timer.round_id IS NULL
           OR EXISTS (
             SELECT 1
               FROM public.rounds round_row
              WHERE round_row.id = timer.round_id
                AND round_row.game_id = p_game_id
                AND round_row.dealer_game_id IS NOT DISTINCT FROM v_game.current_game_uuid
                AND round_row.status NOT IN ('completed', 'game_over')
           )
         );
    END IF;
  END IF;

  IF p_game_id IS NOT NULL AND coalesce(v_game.is_paused, false) THEN
    v_reason := 'game_paused';
  ELSIF NOT v_scheduler_fresh THEN
    v_reason := CASE
      WHEN v_dispatch.last_completed_at IS NULL THEN 'scheduler_heartbeat_missing'
      WHEN v_dispatch.last_outcome IS DISTINCT FROM 'completed' THEN 'scheduler_partial_failure'
      ELSE 'scheduler_heartbeat_stale'
    END;
  ELSIF cardinality(v_failure_tasks) > 0 THEN
    v_reason := 'active_recovery_failure';
  ELSIF jsonb_array_length(v_overdue_timers) > 0 THEN
    v_reason := 'overdue_authoritative_timer';
  ELSE
    v_allowed := true;
    v_reason := 'healthy';
  END IF;

  RETURN jsonb_build_object(
    'outcome', CASE WHEN v_allowed THEN 'healthy' ELSE 'unhealthy' END,
    'admission_allowed', v_allowed,
    'reason', v_reason,
    'checked_at', v_checked_at,
    'game_id', p_game_id,
    'scheduler_last_completed_at', v_dispatch.last_completed_at,
    'scheduler_last_outcome', v_dispatch.last_outcome,
    'scheduler_last_duration_ms', v_dispatch.last_duration_ms,
    'scheduler_consecutive_partial_failures', v_dispatch.consecutive_partial_failures,
    'active_failure_tasks', to_jsonb(v_failure_tasks),
    'overdue_timers', v_overdue_timers
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.evaluate_real_money_liveness(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.evaluate_real_money_liveness(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_real_money_liveness_health(p_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_is_admin boolean := false;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION 'real_money_liveness_health:missing_game_id';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'real_money_liveness_health:authentication_required';
  END IF;

  v_is_admin := v_actor IS NOT NULL
    AND public.has_role(v_actor, 'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'real_money_liveness_health:not_in_session';
  END IF;

  RETURN private.evaluate_real_money_liveness(p_game_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_real_money_liveness_health(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_real_money_liveness_health(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_real_money_liveness_admission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_health jsonb;
BEGIN
  IF coalesce(NEW.real_money, false)
     AND NEW.status = 'ante_decision'
     AND coalesce(NEW.config_complete, false)
     AND OLD.status IN ('game_selection', 'configuring')
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR OLD.current_game_uuid IS DISTINCT FROM NEW.current_game_uuid
     ) THEN
    v_health := private.evaluate_real_money_liveness(NEW.id);
    IF NOT coalesce((v_health->>'admission_allowed')::boolean, false) THEN
      RAISE EXCEPTION 'real_money_liveness_unavailable:%', v_health->>'reason'
        USING ERRCODE = '55000', DETAIL = v_health::text;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_real_money_liveness_admission()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_real_money_liveness_admission ON public.games;
CREATE TRIGGER enforce_real_money_liveness_admission
  BEFORE UPDATE OF status, config_complete, current_game_uuid ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_real_money_liveness_admission();

COMMENT ON FUNCTION private.evaluate_real_money_liveness(uuid) IS
  'Machine-readable recovery health for real-money admission and incident evidence. Paused games and absent Gin/Cribbage human-turn timers are not classified as stagnation.';
COMMENT ON FUNCTION public.get_real_money_liveness_health(uuid) IS
  'Authenticated participant/admin view of redacted scheduler, active-failure, and exact overdue-timer health for one session.';
COMMENT ON TRIGGER enforce_real_money_liveness_admission ON public.games IS
  'Fails closed before a new real-money dealer game enters ante decision unless the authoritative recovery system is healthy.';
