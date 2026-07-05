
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.finalize_voice_operations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.voice_operation_incidents%ROWTYPE;
  _finalized_count INT := 0;
  _edge_succ RECORD;
  _edge_fail RECORD;
  _last_client RECORD;
  _last_server RECORD;
  _client_send_complete RECORD;
  _client_send_failed RECORD;
  _peer_events INT;
  _peer_active_hb TIMESTAMPTZ;
  _sender_hb TIMESTAMPTZ;
  _sender_stale BOOLEAN;
  _terminal TEXT;
  _presence TEXT;
  _peer_status TEXT;
  _report_txt TEXT;
  _report_json JSONB;
  _missing TEXT[];
  _peer_lines TEXT;
  _now TIMESTAMPTZ := now();
BEGIN
  FOR _row IN
    SELECT * FROM public.voice_operation_incidents
     WHERE report_status = 'pending'
       AND started_at < _now - interval '3 seconds'
     ORDER BY started_at
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT * INTO _edge_succ FROM public.voice_operation_events
      WHERE voice_operation_id = _row.voice_operation_id
        AND origin = 'edge'
        AND phase IN ('EDGE_RESPONSE_SENT','EDGE_TRANSCRIPTION_COMPLETED')
      ORDER BY occurred_at DESC LIMIT 1;
    SELECT * INTO _edge_fail FROM public.voice_operation_events
      WHERE voice_operation_id = _row.voice_operation_id
        AND origin = 'edge' AND phase = 'EDGE_REQUEST_FAILED'
      ORDER BY occurred_at DESC LIMIT 1;

    SELECT * INTO _last_client FROM public.voice_operation_events
      WHERE voice_operation_id = _row.voice_operation_id AND origin = 'client'
      ORDER BY occurred_at DESC LIMIT 1;
    SELECT * INTO _last_server FROM public.voice_operation_events
      WHERE voice_operation_id = _row.voice_operation_id AND origin IN ('edge','server')
      ORDER BY occurred_at DESC LIMIT 1;

    SELECT * INTO _client_send_complete FROM public.voice_operation_events
      WHERE voice_operation_id = _row.voice_operation_id
        AND origin = 'client' AND phase = 'SEND_COMPLETE'
      ORDER BY occurred_at DESC LIMIT 1;
    SELECT * INTO _client_send_failed FROM public.voice_operation_events
      WHERE voice_operation_id = _row.voice_operation_id
        AND origin = 'client' AND phase = 'SEND_FAILED'
      ORDER BY occurred_at DESC LIMIT 1;

    SELECT count(*) INTO _peer_events FROM public.voice_peer_witness_events
      WHERE voice_operation_id = _row.voice_operation_id;
    SELECT max(last_heartbeat_at) INTO _peer_active_hb FROM public.voice_presence_heartbeats
      WHERE (_row.game_id IS NULL OR game_id = _row.game_id)
        AND (_row.sender_user_id IS NULL OR user_id <> _row.sender_user_id)
        AND last_heartbeat_at > _row.started_at - interval '30 seconds';
    SELECT max(last_heartbeat_at) INTO _sender_hb FROM public.voice_presence_heartbeats
      WHERE user_id = _row.sender_user_id;

    _sender_stale := (_sender_hb IS NULL) OR (_sender_hb < _now - interval '15 seconds');

    IF _client_send_complete.id IS NOT NULL THEN
      _terminal := 'succeeded';
    ELSIF _client_send_failed.id IS NOT NULL THEN
      _terminal := 'failed-post-send';
    ELSIF _edge_fail.id IS NOT NULL THEN
      _terminal := 'edge-failed';
    ELSIF _edge_succ.id IS NOT NULL AND _edge_succ.occurred_at < _now - interval '5 seconds' THEN
      _terminal := 'edge-succeeded-awaiting-client';
    ELSIF _sender_stale AND _row.started_at < _now - interval '10 seconds' THEN
      _terminal := 'sender-disappeared';
    ELSIF _row.started_at < _now - interval '60 seconds' THEN
      _terminal := 'abandoned';
    ELSE
      CONTINUE;
    END IF;

    _presence := CASE WHEN _sender_stale THEN 'sender-presence-stale' ELSE 'sender-present' END;
    _peer_status := CASE
      WHEN _peer_active_hb IS NOT NULL AND _peer_events > 0 THEN 'peer-present-and-witnessed'
      WHEN _peer_active_hb IS NOT NULL THEN 'peer-present-no-witness-events'
      WHEN _peer_events > 0 THEN 'peer-witness-events-only'
      ELSE 'no-peer-observed'
    END;

    _missing := ARRAY[]::TEXT[];
    IF _row.game_id IS NULL THEN _missing := array_append(_missing, 'no-game-identity-at-open'); END IF;
    IF _last_client.id IS NULL THEN _missing := array_append(_missing, 'no-client-events'); END IF;
    IF _last_server.id IS NULL THEN _missing := array_append(_missing, 'no-edge-or-server-events'); END IF;
    IF _peer_events = 0 AND _peer_active_hb IS NULL THEN _missing := array_append(_missing, 'no-peer-observation'); END IF;
    IF _client_send_complete.id IS NULL AND _client_send_failed.id IS NULL THEN
      _missing := array_append(_missing, 'no-client-send-terminal-event');
    END IF;

    SELECT string_agg(
      '  * ' || observed_at::text || '  ' || event_type ||
      COALESCE(' — ' || (metadata->>'note'), ''),
      E'\n' ORDER BY observed_at
    ) INTO _peer_lines
      FROM public.voice_peer_witness_events
      WHERE voice_operation_id = _row.voice_operation_id;

    _report_txt :=
      'VOICE OPERATION REPORT' || E'\n' ||
      '======================' || E'\n' ||
      'Operation id: ' || _row.voice_operation_id || E'\n' ||
      'Started at:   ' || _row.started_at::text || E'\n' ||
      'Terminal:     ' || _terminal || E'\n' ||
      'Surface:      ' || COALESCE(_row.origin_surface,'unknown') || E'\n' ||
      'Route:        ' || COALESCE(_row.origin_route,'unknown') || E'\n' ||
      'Game id:      ' || COALESCE(_row.game_id::text,'(none)') || E'\n' ||
      'Session id:   ' || COALESCE(_row.session_id,'(none)') || E'\n' ||
      E'\n' ||
      'Recorded facts' || E'\n' ||
      '--------------' || E'\n' ||
      '- Sender last client phase: ' || COALESCE(_last_client.phase,'(none)')
        || COALESCE(' @ ' || _last_client.occurred_at::text, '') || E'\n' ||
      '- Client SEND_COMPLETE:     ' || COALESCE(_client_send_complete.occurred_at::text,'(none)') || E'\n' ||
      '- Client SEND_FAILED:       ' || COALESCE(_client_send_failed.occurred_at::text,'(none)') || E'\n' ||
      '- Edge Function last phase: ' || COALESCE(COALESCE(_edge_fail.phase,_edge_succ.phase),'(none)')
        || COALESCE(' @ ' || COALESCE(_edge_fail.occurred_at,_edge_succ.occurred_at)::text, '')
        || COALESCE(' status=' || COALESCE(_edge_fail.status_code,_edge_succ.status_code)::text, '') || E'\n' ||
      '- Last server-side event:   ' || COALESCE(_last_server.phase,'(none)')
        || COALESCE(' @ ' || _last_server.occurred_at::text, '') || E'\n' ||
      '- Sender heartbeat last:    ' || COALESCE(_sender_hb::text,'(never)') || E'\n' ||
      '- Peer heartbeat (game):    ' || COALESCE(_peer_active_hb::text,'(none)') || E'\n' ||
      E'\n' ||
      'Peer witness observations' || E'\n' ||
      '-------------------------' || E'\n' ||
      COALESCE(_peer_lines,'(no peer witness events)') || E'\n' ||
      E'\n' ||
      'Server-detected presence outcome' || E'\n' ||
      '--------------------------------' || E'\n' ||
      _presence || ' / ' || _peer_status || E'\n' ||
      E'\n' ||
      'Missing evidence' || E'\n' ||
      '----------------' || E'\n' ||
      CASE WHEN array_length(_missing,1) IS NULL THEN '(none)'
           ELSE '- ' || array_to_string(_missing, E'\n- ')
      END || E'\n' ||
      E'\n' ||
      'No causal conclusion beyond recorded facts.' || E'\n';

    _report_json := jsonb_build_object(
      'voice_operation_id', _row.voice_operation_id,
      'terminal_status', _terminal,
      'presence_outcome', _presence,
      'peer_witness_status', _peer_status,
      'game_id', _row.game_id,
      'session_id', _row.session_id,
      'dealer_game_id', _row.dealer_game_id,
      'origin_surface', _row.origin_surface,
      'origin_route', _row.origin_route,
      'sender_last_phase', _last_client.phase,
      'sender_last_at', _last_client.occurred_at,
      'edge_last_phase', COALESCE(_edge_fail.phase, _edge_succ.phase),
      'edge_last_status_code', COALESCE(_edge_fail.status_code, _edge_succ.status_code),
      'edge_last_error', _edge_fail.error_message,
      'sender_heartbeat_last_at', _sender_hb,
      'peer_heartbeat_last_at', _peer_active_hb,
      'peer_witness_event_count', _peer_events,
      'missing_evidence', to_jsonb(_missing)
    );

    INSERT INTO public.voice_operation_reports (
      voice_operation_id, sender_user_id, game_id,
      terminal_status, report_text, report_json
    ) VALUES (
      _row.voice_operation_id, _row.sender_user_id, _row.game_id,
      _terminal, _report_txt, _report_json
    )
    ON CONFLICT (voice_operation_id) DO UPDATE
      SET terminal_status = EXCLUDED.terminal_status,
          report_text     = EXCLUDED.report_text,
          report_json     = EXCLUDED.report_json,
          game_id         = COALESCE(EXCLUDED.game_id, public.voice_operation_reports.game_id),
          finalized_at    = now();

    UPDATE public.voice_operation_incidents
       SET terminal_status = _terminal,
           terminal_reason = _terminal,
           report_status = 'complete',
           completed_at = now(),
           peer_witness_status = _peer_status,
           presence_outcome = _presence,
           client_last_phase = COALESCE(_last_client.phase, client_last_phase),
           client_last_phase_at = COALESCE(_last_client.occurred_at, client_last_phase_at),
           edge_function_last_phase = COALESCE(COALESCE(_edge_fail.phase,_edge_succ.phase), edge_function_last_phase),
           edge_function_last_phase_at = COALESCE(COALESCE(_edge_fail.occurred_at,_edge_succ.occurred_at), edge_function_last_phase_at),
           edge_function_status_code = COALESCE(COALESCE(_edge_fail.status_code,_edge_succ.status_code), edge_function_status_code),
           edge_function_error_message = COALESCE(_edge_fail.error_message, edge_function_error_message),
           server_last_phase = COALESCE(_last_server.phase, server_last_phase),
           server_last_phase_at = COALESCE(_last_server.occurred_at, server_last_phase_at),
           client_heartbeat_last_at = COALESCE(_sender_hb, client_heartbeat_last_at),
           peer_heartbeat_last_at = COALESCE(_peer_active_hb, peer_heartbeat_last_at)
     WHERE id = _row.id;

    _finalized_count := _finalized_count + 1;
  END LOOP;

  RETURN _finalized_count;
END;
$function$;

DO $$
DECLARE
  _job_id BIGINT;
BEGIN
  SELECT jobid INTO _job_id FROM cron.job WHERE jobname = 'finalize-voice-operations-5s';
  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;
  PERFORM cron.schedule(
    'finalize-voice-operations-5s',
    '5 seconds',
    $cron$SELECT public.finalize_voice_operations();$cron$
  );
END;
$$;

SELECT public.finalize_voice_operations();
