
-- 1. Schema additions
ALTER TABLE public.chat_send_operations
  ADD COLUMN IF NOT EXISTS last_sender_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sender_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_peer_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS boundary_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recovery_correlations jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Sender heartbeat
CREATE OR REPLACE FUNCTION public.chat_operation_sender_heartbeat(
  _operation_id text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chat_send_operations
     SET last_sender_heartbeat_at = now(),
         last_sender_event_at = now(),
         updated_at = now()
   WHERE operation_id = _operation_id
     AND (sender_user_id = auth.uid() OR auth.role() = 'service_role');
END;
$$;

-- 3. Peer heartbeat
CREATE OR REPLACE FUNCTION public.chat_operation_peer_heartbeat(
  _operation_id text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _game_id uuid;
BEGIN
  SELECT game_id INTO _game_id FROM public.chat_send_operations WHERE operation_id = _operation_id;
  IF _game_id IS NULL THEN RETURN; END IF;
  IF NOT public.user_is_in_game(_game_id) THEN RETURN; END IF;
  UPDATE public.chat_send_operations
     SET last_peer_heartbeat_at = now(),
         updated_at = now()
   WHERE operation_id = _operation_id;
END;
$$;

-- 4. Boundary event append (role-tagged)
CREATE OR REPLACE FUNCTION public.chat_operation_append_boundary_event(
  _operation_id text,
  _name text,
  _role text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _game_id uuid;
  _sender_id uuid;
  _entry jsonb;
BEGIN
  SELECT game_id, sender_user_id INTO _game_id, _sender_id
    FROM public.chat_send_operations WHERE operation_id = _operation_id;
  IF _game_id IS NULL THEN RETURN; END IF;
  IF _sender_id <> auth.uid() AND NOT public.user_is_in_game(_game_id) THEN RETURN; END IF;

  _entry := jsonb_build_object(
    'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'name', _name,
    'role', _role,
    'actor_user_id', auth.uid(),
    'metadata', COALESCE(_metadata, '{}'::jsonb)
  );

  UPDATE public.chat_send_operations
     SET boundary_events = COALESCE(boundary_events, '[]'::jsonb) || _entry,
         last_sender_event_at = CASE WHEN _role = 'sender' THEN now() ELSE last_sender_event_at END,
         updated_at = now()
   WHERE operation_id = _operation_id;
END;
$$;

-- 5. Recovery correlation append
CREATE OR REPLACE FUNCTION public.chat_operation_append_recovery_correlation(
  _operation_id text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sender_id uuid;
  _entry jsonb;
BEGIN
  SELECT sender_user_id INTO _sender_id
    FROM public.chat_send_operations WHERE operation_id = _operation_id;
  IF _sender_id IS NULL OR _sender_id <> auth.uid() THEN RETURN; END IF;

  _entry := jsonb_build_object(
    'at', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor_user_id', auth.uid(),
    'metadata', COALESCE(_metadata, '{}'::jsonb)
  );

  UPDATE public.chat_send_operations
     SET recovery_correlations = COALESCE(recovery_correlations, '[]'::jsonb) || _entry,
         updated_at = now()
   WHERE operation_id = _operation_id;
END;
$$;

-- 6. Presence read (used by peer to decide sender-lost)
CREATE OR REPLACE FUNCTION public.chat_operation_read_sender_presence(_operation_id text)
RETURNS TABLE(
  status text,
  terminal_status text,
  last_sender_event_at timestamptz,
  last_sender_heartbeat_at timestamptz,
  last_peer_heartbeat_at timestamptz,
  now_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _game_id uuid;
BEGIN
  SELECT o.game_id INTO _game_id FROM public.chat_send_operations o WHERE o.operation_id = _operation_id;
  IF _game_id IS NULL OR NOT public.user_is_in_game(_game_id) THEN RETURN; END IF;
  RETURN QUERY
    SELECT o.status, o.terminal_status, o.last_sender_event_at, o.last_sender_heartbeat_at, o.last_peer_heartbeat_at, now()
      FROM public.chat_send_operations o WHERE o.operation_id = _operation_id;
END;
$$;

-- 7. Rewrite finalizer to include new evidence + support sender-lost
CREATE OR REPLACE FUNCTION public.finalize_chat_send_operation(
  _operation_id text,
  _terminal_status text DEFAULT NULL,
  _terminal_reason text DEFAULT NULL,
  _extra_snapshots jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row public.chat_send_operations%ROWTYPE;
  _status text;
  _reason text;
  _report_text text;
  _report_json jsonb;
  _snapshot_count int;
  _peer_count int;
  _sender_count int;
  _violation_count int;
  _boundary_count int;
  _recovery_count int;
  _has_peer_realtime boolean;
  _has_tab_snapshot boolean;
  _missing text[] := ARRAY[]::text[];
  _identity_ok boolean;
BEGIN
  SELECT * INTO _row FROM public.chat_send_operations WHERE operation_id = _operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','rejected','reason','operation-not-found');
  END IF;

  IF _row.operation_type <> 'chat_send'
     OR _row.source_kind <> 'real'
     OR _row.game_id IS NULL
     OR _row.session_id IS NULL
     OR length(_row.session_id) = 0
     OR _row.route IS NULL
     OR _row.route = '/'
     OR _row.operation_id NOT LIKE 'chat-%'
  THEN
    RETURN jsonb_build_object('outcome','rejected','reason','invalid-chat-operation-identity');
  END IF;

  IF _row.sender_user_id <> auth.uid() AND NOT public.user_is_in_game(_row.game_id) THEN
    RAISE EXCEPTION 'Not in chat operation game';
  END IF;

  _row.tab_attention_snapshots := COALESCE(_row.tab_attention_snapshots, '[]'::jsonb) || COALESCE(_extra_snapshots, '[]'::jsonb);
  _snapshot_count  := jsonb_array_length(COALESCE(_row.tab_attention_snapshots, '[]'::jsonb));
  _peer_count      := jsonb_array_length(COALESCE(_row.peer_milestones, '[]'::jsonb));
  _sender_count    := jsonb_array_length(COALESCE(_row.sender_milestones, '[]'::jsonb));
  _violation_count := jsonb_array_length(COALESCE(_row.violations, '[]'::jsonb));
  _boundary_count  := jsonb_array_length(COALESCE(_row.boundary_events, '[]'::jsonb));
  _recovery_count  := jsonb_array_length(COALESCE(_row.recovery_correlations, '[]'::jsonb));

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(_row.peer_milestones, '[]'::jsonb)) AS e
    WHERE e->>'phase' IN ('REALTIME_RECEIPT', 'SHELL_TAB_ATTENTION_SNAPSHOT')
  ) INTO _has_peer_realtime;
  _has_tab_snapshot := _snapshot_count > 0;

  _status := COALESCE(
    _terminal_status,
    _row.terminal_status,
    CASE WHEN _has_peer_realtime AND _has_tab_snapshot THEN 'peer-received' ELSE 'send-complete' END
  );
  _reason := COALESCE(_terminal_reason, _row.terminal_reason, _status);

  _identity_ok := (
    _row.route_game_id IS NOT NULL
    AND _row.canonical_shell_game_id IS NOT NULL
    AND _row.operation_game_id IS NOT NULL
    AND _row.route_game_id = _row.canonical_shell_game_id
    AND _row.canonical_shell_game_id = _row.operation_game_id
  );

  IF _row.route_game_id IS NULL THEN _missing := array_append(_missing, 'route_game_id'); END IF;
  IF _row.canonical_shell_game_id IS NULL THEN _missing := array_append(_missing, 'canonical_shell_game_id'); END IF;
  IF _row.operation_game_id IS NULL THEN _missing := array_append(_missing, 'operation_game_id'); END IF;
  IF NOT _identity_ok THEN _missing := array_append(_missing, 'IDENTITY_MISMATCH: route/canonical-shell/operation game ids diverge'); END IF;
  IF NOT _has_peer_realtime THEN _missing := array_append(_missing, 'peer_realtime_receipt'); END IF;
  IF NOT _has_tab_snapshot THEN _missing := array_append(_missing, 'tab_attention_snapshot'); END IF;
  IF _status = 'sender-lost' AND _row.last_sender_heartbeat_at IS NULL THEN
    _missing := array_append(_missing, 'sender_heartbeat_never_written');
  END IF;

  UPDATE public.chat_send_operations
     SET status = 'finalized',
         terminal_status = _status,
         terminal_reason = _reason,
         report_status = 'complete',
         completed_at = COALESCE(completed_at, now()),
         tab_attention_snapshots = _row.tab_attention_snapshots,
         updated_at = now()
   WHERE operation_id = _operation_id
  RETURNING * INTO _row;

  _report_json := jsonb_build_object(
    'operation_type', 'chat_send',
    'operation_id', _row.operation_id,
    'source_kind', _row.source_kind,
    'terminal_status', _status,
    'terminal_reason', _reason,
    'identity', jsonb_build_object(
      'game_id', _row.game_id,
      'session_id', _row.session_id,
      'route', _row.route,
      'route_game_id', _row.route_game_id,
      'canonical_shell_game_id', _row.canonical_shell_game_id,
      'operation_game_id', _row.operation_game_id,
      'identity_ok', _identity_ok
    ),
    'context', jsonb_build_object(
      'origin_surface', _row.origin_surface,
      'active_tab', _row.active_tab,
      'shell_phase', _row.shell_phase,
      'raw_game_type', _row.raw_game_type,
      'resolved_game_type', _row.resolved_game_type,
      'game_type_source', _row.game_type_source,
      'game_controller_present', _row.game_controller_present,
      'current_turn_player_id', _row.current_turn_player_id,
      'local_turn_eligible', _row.local_turn_eligible,
      'waiting_table_component', _row.waiting_table_component,
      'active_game_component', _row.active_game_component,
      'tab_bar_render_key', _row.tab_bar_render_key,
      'dealer_game_id', _row.dealer_game_id
    ),
    'sender_user_id', _row.sender_user_id,
    'sender_client_instance_id', _row.sender_client_instance_id,
    'sender_tab_session_id', _row.sender_tab_session_id,
    'message_id', _row.message_id,
    'optimistic_message_id', _row.optimistic_message_id,
    'started_at', _row.started_at,
    'completed_at', _row.completed_at,
    'presence', jsonb_build_object(
      'last_sender_event_at', _row.last_sender_event_at,
      'last_sender_heartbeat_at', _row.last_sender_heartbeat_at,
      'last_peer_heartbeat_at', _row.last_peer_heartbeat_at
    ),
    'sender_milestones', _row.sender_milestones,
    'peer_milestones', _row.peer_milestones,
    'tab_attention_snapshots', _row.tab_attention_snapshots,
    'violations', _row.violations,
    'boundary_events', _row.boundary_events,
    'recovery_correlations', _row.recovery_correlations,
    'counts', jsonb_build_object(
      'snapshot', _snapshot_count,
      'peer_milestone', _peer_count,
      'sender_milestone', _sender_count,
      'violation', _violation_count,
      'boundary_event', _boundary_count,
      'recovery_correlation', _recovery_count
    ),
    'missing_evidence', to_jsonb(_missing)
  );

  _report_text :=
    'CHAT SEND INCIDENT REPORT' || E'\n' ||
    '=========================' || E'\n' ||
    'Operation id                : ' || _row.operation_id || E'\n' ||
    'Terminal status             : ' || _status || E'\n' ||
    'Terminal reason             : ' || _reason || E'\n' ||
    E'\n' ||
    'IDENTITY' || E'\n' ||
    'game_id                     : ' || _row.game_id::text || E'\n' ||
    'session_id                  : ' || _row.session_id || E'\n' ||
    'route                       : ' || _row.route || E'\n' ||
    'identity_ok                 : ' || CASE WHEN _identity_ok THEN 'yes' ELSE 'NO' END || E'\n' ||
    E'\n' ||
    'PRESENCE' || E'\n' ||
    'last_sender_event_at        : ' || COALESCE(_row.last_sender_event_at::text, '(null)') || E'\n' ||
    'last_sender_heartbeat_at    : ' || COALESCE(_row.last_sender_heartbeat_at::text, '(null)') || E'\n' ||
    'last_peer_heartbeat_at      : ' || COALESCE(_row.last_peer_heartbeat_at::text, '(null)') || E'\n' ||
    E'\n' ||
    'COUNTS' || E'\n' ||
    'sender_milestones           : ' || _sender_count::text || E'\n' ||
    'peer_milestones             : ' || _peer_count::text || E'\n' ||
    'tab_attention_snapshots     : ' || _snapshot_count::text || E'\n' ||
    'violations                  : ' || _violation_count::text || E'\n' ||
    'boundary_events             : ' || _boundary_count::text || E'\n' ||
    'recovery_correlations       : ' || _recovery_count::text || E'\n' ||
    E'\n' ||
    'SENDER MILESTONES' || E'\n' ||
    COALESCE(jsonb_pretty(_row.sender_milestones), '[]') || E'\n\n' ||
    'PEER MILESTONES' || E'\n' ||
    COALESCE(jsonb_pretty(_row.peer_milestones), '[]') || E'\n\n' ||
    'BOUNDARY EVENTS' || E'\n' ||
    COALESCE(jsonb_pretty(_row.boundary_events), '[]') || E'\n\n' ||
    'RECOVERY CORRELATIONS' || E'\n' ||
    COALESCE(jsonb_pretty(_row.recovery_correlations), '[]') || E'\n\n' ||
    'SHELL TAB ATTENTION SNAPSHOTS' || E'\n' ||
    COALESCE(jsonb_pretty(_row.tab_attention_snapshots), '[]') || E'\n\n' ||
    'VIOLATIONS' || E'\n' ||
    COALESCE(jsonb_pretty(_row.violations), '[]') || E'\n\n' ||
    'MISSING EVIDENCE' || E'\n' ||
    CASE WHEN array_length(_missing, 1) IS NULL THEN '(none)'
         ELSE array_to_string(_missing, E'\n') END || E'\n';

  INSERT INTO public.chat_operation_reports (
    operation_id, sender_user_id, game_id, session_id,
    terminal_status, report_text, report_json, finalized_at
  ) VALUES (
    _row.operation_id, _row.sender_user_id, _row.game_id, _row.session_id,
    _status, _report_text, _report_json, now()
  )
  ON CONFLICT (operation_id) DO UPDATE
    SET terminal_status = EXCLUDED.terminal_status,
        report_text = EXCLUDED.report_text,
        report_json = EXCLUDED.report_json,
        finalized_at = EXCLUDED.finalized_at,
        updated_at = now();

  RETURN jsonb_build_object('outcome','ok','terminal_status',_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_operation_sender_heartbeat(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_operation_peer_heartbeat(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_operation_append_boundary_event(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_operation_append_recovery_correlation(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_operation_read_sender_presence(text) TO authenticated;
