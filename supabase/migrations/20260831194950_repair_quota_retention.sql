-- Keep the owned Supabase project below its storage quota without touching
-- gameplay, financial, audit, or durable session-history rows.
--
-- The general diagnostic purge had stopped at a text-to-uuid comparison
-- before reaching the two high-volume debug tables. A separate quota-critical
-- owner now bounds those tables and pg_cron history even if an unrelated
-- diagnostic family changes shape later.

CREATE OR REPLACE FUNCTION private.purge_quota_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_debug_events bigint := 0;
  v_debug_sync_events bigint := 0;
  v_cron_successes bigint := 0;
  v_cron_failures bigint := 0;
BEGIN
  DELETE FROM public.debug_events
   WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_debug_events = ROW_COUNT;

  DELETE FROM public.debug_sync_events
   WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_debug_sync_events = ROW_COUNT;

  DELETE FROM cron.job_run_details
   WHERE status = 'succeeded'
     AND coalesce(end_time, start_time) < now() - interval '1 day';
  GET DIAGNOSTICS v_cron_successes = ROW_COUNT;

  DELETE FROM cron.job_run_details
   WHERE status IS DISTINCT FROM 'succeeded'
     AND status IS DISTINCT FROM 'running'
     AND coalesce(end_time, start_time) < now() - interval '7 days';
  GET DIAGNOSTICS v_cron_failures = ROW_COUNT;

  RETURN jsonb_build_object(
    'debug_events', v_debug_events,
    'debug_sync_events', v_debug_sync_events,
    'cron_successes', v_cron_successes,
    'cron_failures', v_cron_failures
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.purge_quota_diagnostics()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.purge_quota_diagnostics()
  TO service_role;

COMMENT ON FUNCTION private.purge_quota_diagnostics() IS
  'Quota-critical daily retention owner. Keeps debug tables for one day, successful pg_cron history for one day, and failed pg_cron history for seven days.';

-- Preserve the broader diagnostic cleanup while correcting its exact deployed
-- chat-operation identity mismatch. Audit and session history remain excluded.
CREATE OR REPLACE FUNCTION public.purge_expired_diagnostics(
  _retention interval DEFAULT interval '1 day'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _cutoff timestamptz := now() - GREATEST(_retention, interval '1 day');
  _deleted bigint;
  _total bigint := 0;
BEGIN
  DELETE FROM public.chat_message_diagnostic_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.chat_diagnostic_sessions WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.chat_message_delivery_trace WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  UPDATE public.chat_messages m
  SET chat_operation_id = NULL
  FROM public.chat_send_operations o
  WHERE m.chat_operation_id = o.id::text
    AND o.created_at < _cutoff;
  DELETE FROM public.chat_operation_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.chat_send_operations WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  DELETE FROM public.client_runtime_event_outbox WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_incident_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_incidents WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.client_runtime_instances WHERE last_seen_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  DELETE FROM public.debug_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.debug_sync_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.game_state_debug_log WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.network_sim_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.sitting_out_debug_log WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.visual_bug_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  DELETE FROM public.dice_trace_samples WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.dice_trace_sessions WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.performance_traces WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.trace_sessions WHERE COALESCE(ended_at, started_at) < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.timing_debug_sessions WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_operation_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_operation_reports WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_peer_witness_events WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_presence_heartbeats WHERE last_heartbeat_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;
  DELETE FROM public.voice_operation_incidents WHERE created_at < _cutoff;
  GET DIAGNOSTICS _deleted = ROW_COUNT; _total := _total + _deleted;

  RETURN _total;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_diagnostics(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_diagnostics(interval)
  TO service_role;

COMMENT ON FUNCTION public.purge_expired_diagnostics(interval) IS
  'Broad diagnostic retention owner. Retains at least one day and excludes durable audit and session-history tables.';

DO $schedule$
DECLARE
  v_general_job_id bigint;
BEGIN
  PERFORM cron.schedule(
    'purge-quota-diagnostics-daily',
    '0 4 * * *',
    $cron$SELECT private.purge_quota_diagnostics();$cron$
  );

  SELECT jobid
    INTO v_general_job_id
    FROM cron.job
   WHERE jobname = 'purge-expired-diagnostics-daily';

  IF v_general_job_id IS NULL THEN
    PERFORM cron.schedule(
      'purge-expired-diagnostics-daily',
      '15 4 * * *',
      $cron$SELECT public.purge_expired_diagnostics(interval '1 day');$cron$
    );
  ELSE
    PERFORM cron.alter_job(
      job_id := v_general_job_id,
      schedule := '15 4 * * *',
      command := $cron$SELECT public.purge_expired_diagnostics(interval '1 day');$cron$,
      active := true
    );
  END IF;
END
$schedule$;
