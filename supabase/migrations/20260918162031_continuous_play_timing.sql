-- Continuous observation only; replay facts and atomic writes are unchanged.
-- Production migration version returned by Supabase: 20260918162031.
CREATE OR REPLACE FUNCTION private.replay_live_timing_start_v1()
RETURNS timestamptz LANGUAGE plpgsql SET search_path=pg_catalog AS $timing$
DECLARE sampled text;
BEGIN
 IF current_setting('app.live_timing_disabled',true)='true' THEN RETURN NULL; END IF;
 sampled:=nullif(current_setting('app.replay_live_sampled',true),'');
 IF sampled IS NULL THEN
  -- One independent 25% selection per HTTP transaction, shared by all sections.
  sampled:=(coalesce(current_setting('request.method',true)='POST',false) AND random()<0.25)::text;
  PERFORM set_config('app.replay_live_sampled',sampled,true);
 END IF;
 IF sampled='true' THEN RETURN clock_timestamp(); END IF;
 RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$timing$;
REVOKE ALL ON FUNCTION private.replay_live_timing_start_v1() FROM PUBLIC,anon,authenticated,service_role;
DO $guard$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='replay_gin_open_v1';
 IF source IS NULL OR md5(source)<>'afb776256dc661154c393bcecfd8b484' THEN RAISE EXCEPTION 'continuous_timing:owner_drift:replay_gin_open_v1'; END IF;
 EXECUTE replace(source,$old$CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END$old$,$new$private.replay_live_timing_start_v1()$new$);
END; $guard$;
DO $guard$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='replay_gin_postgame_v1';
 IF source IS NULL OR md5(source)<>'fb990aa57c0052385cae660336188426' THEN RAISE EXCEPTION 'continuous_timing:owner_drift:replay_gin_postgame_v1'; END IF;
 EXECUTE replace(source,$old$CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END$old$,$new$private.replay_live_timing_start_v1()$new$);
END; $guard$;
DO $guard$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='replay_gin_shared_begin_v1';
 IF source IS NULL OR md5(source)<>'3a4f0bbf829c4f8135fc2813abffd144' THEN RAISE EXCEPTION 'continuous_timing:owner_drift:replay_gin_shared_begin_v1'; END IF;
 EXECUTE replace(source,$old$CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END$old$,$new$private.replay_live_timing_start_v1()$new$);
END; $guard$;
DO $guard$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='replay_gin_shared_end_v1';
 IF source IS NULL OR md5(source)<>'089004de2d32dbc670d73db1fc598818' THEN RAISE EXCEPTION 'continuous_timing:owner_drift:replay_gin_shared_end_v1'; END IF;
 EXECUTE replace(source,$old$CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END$old$,$new$private.replay_live_timing_start_v1()$new$);
END; $guard$;
DO $guard$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='replay_gin_transition_v1';
 IF source IS NULL OR md5(source)<>'f7d95a2f6fae368f508cde48600dab92' THEN RAISE EXCEPTION 'continuous_timing:owner_drift:replay_gin_transition_v1'; END IF;
 EXECUTE replace(source,$old$CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END$old$,$new$private.replay_live_timing_start_v1()$new$);
END; $guard$;
DO $guard$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='replay_gin_note_transfer_v1';
 IF source IS NULL OR md5(source)<>'b69703e188cbee2d1e9368c8f3053f64' THEN RAISE EXCEPTION 'continuous_timing:owner_drift:replay_gin_note_transfer_v1'; END IF;
 EXECUTE replace(source,$old$CASE WHEN clock_timestamp() < '2026-09-17T12:00:00Z'::timestamptz AND current_setting('app.live_timing_disabled',true) IS DISTINCT FROM 'true' THEN clock_timestamp() END$old$,$new$private.replay_live_timing_start_v1()$new$);
END; $guard$;
DO $retention$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='purge_quota_diagnostics';
 IF source IS DISTINCT FROM $original$CREATE OR REPLACE FUNCTION private.purge_quota_diagnostics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
$original$ THEN RAISE EXCEPTION 'continuous_timing:retention_drift'; END IF;
 EXECUTE replace(source,$old$WHERE created_at < now() - interval '1 day';$old$,$new$WHERE created_at < now() - interval '1 day'
     AND (event_type NOT IN ('live-play-timing-v1','card-visibility-invariant') OR event_type IS NULL OR created_at < now() - interval '7 days');$new$);
END; $retention$;
DO $retention$ DECLARE source text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO source FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='purge_expired_diagnostics';
 IF source IS DISTINCT FROM $original$CREATE OR REPLACE FUNCTION public.purge_expired_diagnostics(_retention interval DEFAULT '1 day'::interval)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
$function$
$original$ THEN RAISE EXCEPTION 'continuous_timing:retention_drift'; END IF;
 EXECUTE replace(source,$old$DELETE FROM public.debug_events WHERE created_at < _cutoff;$old$,$new$DELETE FROM public.debug_events WHERE created_at < _cutoff
    AND (event_type NOT IN ('live-play-timing-v1','card-visibility-invariant') OR event_type IS NULL OR created_at < now() - interval '7 days');$new$);
END; $retention$;
