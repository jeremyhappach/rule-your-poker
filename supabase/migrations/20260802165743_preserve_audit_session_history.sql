-- Tighten the diagnostic-retention boundary: audit and session-history rows
-- remain durable even when the high-volume diagnostic purge runs.

CREATE OR REPLACE FUNCTION public.purge_expired_diagnostics(
  _retention interval DEFAULT interval '7 days'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  WHERE m.chat_operation_id = o.id
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
