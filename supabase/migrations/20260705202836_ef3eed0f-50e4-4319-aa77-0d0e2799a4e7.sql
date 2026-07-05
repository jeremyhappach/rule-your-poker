
-- 1. Extend chat_send_operations with durable waiting-table context fields + violations log
ALTER TABLE public.chat_send_operations
  ADD COLUMN IF NOT EXISTS route_game_id text,
  ADD COLUMN IF NOT EXISTS canonical_shell_game_id text,
  ADD COLUMN IF NOT EXISTS operation_game_id text,
  ADD COLUMN IF NOT EXISTS raw_game_type text,
  ADD COLUMN IF NOT EXISTS resolved_game_type text,
  ADD COLUMN IF NOT EXISTS game_type_source text,
  ADD COLUMN IF NOT EXISTS game_controller_present boolean,
  ADD COLUMN IF NOT EXISTS current_turn_player_id text,
  ADD COLUMN IF NOT EXISTS local_turn_eligible boolean,
  ADD COLUMN IF NOT EXISTS waiting_table_component text,
  ADD COLUMN IF NOT EXISTS active_game_component text,
  ADD COLUMN IF NOT EXISTS tab_bar_render_key text,
  ADD COLUMN IF NOT EXISTS violations jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Append-violation RPC (callable by sender or anyone in the game)
CREATE OR REPLACE FUNCTION public.chat_operation_append_violation(
  _operation_id text,
  _name text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.chat_send_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _row public.chat_send_operations%ROWTYPE;
  _event jsonb;
  _seq int;
BEGIN
  SELECT * INTO _row FROM public.chat_send_operations WHERE operation_id = _operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat operation not found';
  END IF;
  IF _row.sender_user_id <> auth.uid() AND NOT public.user_is_in_game(_row.game_id) THEN
    RAISE EXCEPTION 'Not in chat operation game';
  END IF;

  _seq := jsonb_array_length(COALESCE(_row.violations, '[]'::jsonb));
  _event := jsonb_build_object(
    'name', _name,
    'sequence', _seq,
    'at', now(),
    'actor_user_id', auth.uid(),
    'metadata', COALESCE(_metadata, '{}'::jsonb)
  );

  UPDATE public.chat_send_operations
     SET violations = COALESCE(violations, '[]'::jsonb) || jsonb_build_array(_event),
         updated_at = now()
   WHERE operation_id = _operation_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$function$;

-- 3. Rewrite finalize_chat_send_operation to include full context + violations + missing-evidence
CREATE OR REPLACE FUNCTION public.finalize_chat_send_operation(
  _operation_id text,
  _terminal_status text DEFAULT NULL::text,
  _terminal_reason text DEFAULT NULL::text,
  _extra_snapshots jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

  -- Identity invariant: on /game/:gameId all three ids must match
  _identity_ok := (
    _row.route_game_id IS NOT NULL
    AND _row.canonical_shell_game_id IS NOT NULL
    AND _row.operation_game_id IS NOT NULL
    AND _row.route_game_id = _row.canonical_shell_game_id
    AND _row.canonical_shell_game_id = _row.operation_game_id
  );

  -- Missing-evidence
  IF _row.route_game_id IS NULL THEN _missing := array_append(_missing, 'route_game_id'); END IF;
  IF _row.canonical_shell_game_id IS NULL THEN _missing := array_append(_missing, 'canonical_shell_game_id'); END IF;
  IF _row.operation_game_id IS NULL THEN _missing := array_append(_missing, 'operation_game_id'); END IF;
  IF _row.raw_game_type IS NULL THEN _missing := array_append(_missing, 'raw_game_type'); END IF;
  IF _row.resolved_game_type IS NULL THEN _missing := array_append(_missing, 'resolved_game_type'); END IF;
  IF _row.game_type_source IS NULL THEN _missing := array_append(_missing, 'game_type_source'); END IF;
  IF _row.game_controller_present IS NULL THEN _missing := array_append(_missing, 'game_controller_present'); END IF;
  IF _row.current_turn_player_id IS NULL THEN _missing := array_append(_missing, 'current_turn_player_id (may be legitimately null)'); END IF;
  IF _row.local_turn_eligible IS NULL THEN _missing := array_append(_missing, 'local_turn_eligible'); END IF;
  IF _row.waiting_table_component IS NULL THEN _missing := array_append(_missing, 'waiting_table_component'); END IF;
  IF _row.active_game_component IS NULL THEN _missing := array_append(_missing, 'active_game_component (may be legitimately null)'); END IF;
  IF _row.tab_bar_render_key IS NULL THEN _missing := array_append(_missing, 'tab_bar_render_key'); END IF;
  IF NOT _identity_ok THEN _missing := array_append(_missing, 'IDENTITY_MISMATCH: route/canonical-shell/operation game ids diverge'); END IF;
  IF NOT _has_peer_realtime THEN _missing := array_append(_missing, 'peer_realtime_receipt'); END IF;
  IF NOT _has_tab_snapshot THEN _missing := array_append(_missing, 'tab_attention_snapshot'); END IF;

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
    'sender_milestones', _row.sender_milestones,
    'peer_milestones', _row.peer_milestones,
    'tab_attention_snapshots', _row.tab_attention_snapshots,
    'violations', _row.violations,
    'counts', jsonb_build_object(
      'snapshot', _snapshot_count,
      'peer_milestone', _peer_count,
      'sender_milestone', _sender_count,
      'violation', _violation_count
    ),
    'missing_evidence', to_jsonb(_missing)
  );

  _report_text :=
    'CHAT SEND INCIDENT REPORT' || E'\n' ||
    '=========================' || E'\n' ||
    'Operation type              : chat_send' || E'\n' ||
    'Operation id                : ' || _row.operation_id || E'\n' ||
    'Source kind                 : ' || _row.source_kind || E'\n' ||
    'Terminal status             : ' || _status || E'\n' ||
    'Terminal reason             : ' || _reason || E'\n' ||
    E'\n' ||
    'IDENTITY' || E'\n' ||
    '--------' || E'\n' ||
    'game_id                     : ' || _row.game_id::text || E'\n' ||
    'session_id                  : ' || _row.session_id || E'\n' ||
    'route                       : ' || _row.route || E'\n' ||
    'route_game_id               : ' || COALESCE(_row.route_game_id, '(null)') || E'\n' ||
    'canonical_shell_game_id     : ' || COALESCE(_row.canonical_shell_game_id, '(null)') || E'\n' ||
    'operation_game_id           : ' || COALESCE(_row.operation_game_id, '(null)') || E'\n' ||
    'identity_ok                 : ' || CASE WHEN _identity_ok THEN 'yes' ELSE 'NO — IDENTITY MISMATCH' END || E'\n' ||
    E'\n' ||
    'CONTEXT' || E'\n' ||
    '-------' || E'\n' ||
    'origin_surface              : ' || COALESCE(_row.origin_surface, '(null)') || E'\n' ||
    'active_tab                  : ' || COALESCE(_row.active_tab, '(null)') || E'\n' ||
    'shell_phase                 : ' || COALESCE(_row.shell_phase, '(null)') || E'\n' ||
    'raw_game_type               : ' || COALESCE(_row.raw_game_type, '(null)') || E'\n' ||
    'resolved_game_type          : ' || COALESCE(_row.resolved_game_type, '(null)') || E'\n' ||
    'game_type_source            : ' || COALESCE(_row.game_type_source, '(null)') || E'\n' ||
    'game_controller_present     : ' || COALESCE(_row.game_controller_present::text, '(null)') || E'\n' ||
    'current_turn_player_id      : ' || COALESCE(_row.current_turn_player_id, '(null)') || E'\n' ||
    'local_turn_eligible         : ' || COALESCE(_row.local_turn_eligible::text, '(null)') || E'\n' ||
    'waiting_table_component     : ' || COALESCE(_row.waiting_table_component, '(null)') || E'\n' ||
    'active_game_component       : ' || COALESCE(_row.active_game_component, '(null)') || E'\n' ||
    'tab_bar_render_key          : ' || COALESCE(_row.tab_bar_render_key, '(null)') || E'\n' ||
    'dealer_game_id              : ' || COALESCE(_row.dealer_game_id::text, '(null)') || E'\n' ||
    E'\n' ||
    'COUNTS' || E'\n' ||
    '------' || E'\n' ||
    'sender_milestones           : ' || _sender_count::text || E'\n' ||
    'peer_milestones             : ' || _peer_count::text || E'\n' ||
    'tab_attention_snapshots     : ' || _snapshot_count::text || E'\n' ||
    'violations                  : ' || _violation_count::text || E'\n' ||
    'has_peer_realtime_receipt   : ' || CASE WHEN _has_peer_realtime THEN 'yes' ELSE 'no' END || E'\n' ||
    'has_tab_attention_snapshot  : ' || CASE WHEN _has_tab_snapshot THEN 'yes' ELSE 'no' END || E'\n' ||
    E'\n' ||
    'SENDER MILESTONES (ordered)' || E'\n' ||
    COALESCE(jsonb_pretty(_row.sender_milestones), '[]') || E'\n' ||
    E'\n' ||
    'PEER MILESTONES (ordered)' || E'\n' ||
    COALESCE(jsonb_pretty(_row.peer_milestones), '[]') || E'\n' ||
    E'\n' ||
    'SHELL TAB ATTENTION SNAPSHOTS' || E'\n' ||
    COALESCE(jsonb_pretty(_row.tab_attention_snapshots), '[]') || E'\n' ||
    E'\n' ||
    'VIOLATIONS (ordered)' || E'\n' ||
    COALESCE(jsonb_pretty(_row.violations), '[]') || E'\n' ||
    E'\n' ||
    'MISSING EVIDENCE' || E'\n' ||
    '----------------' || E'\n' ||
    CASE WHEN array_length(_missing, 1) IS NULL
         THEN '(none)'
         ELSE array_to_string(_missing, E'\n')
    END || E'\n';

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
        finalized_at = now(),
        updated_at = now();

  RETURN jsonb_build_object(
    'outcome', 'finalized',
    'operation_id', _row.operation_id,
    'terminal_status', _status,
    'report_text', _report_text,
    'report_json', _report_json,
    'missing_evidence', to_jsonb(_missing),
    'identity_ok', _identity_ok
  );
END;
$function$;
