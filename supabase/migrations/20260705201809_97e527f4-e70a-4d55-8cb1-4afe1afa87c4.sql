CREATE OR REPLACE FUNCTION public.finalize_chat_send_operation(
  _operation_id text,
  _terminal_status text DEFAULT NULL::text,
  _terminal_reason text DEFAULT NULL::text,
  _extra_snapshots jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.chat_send_operations%ROWTYPE;
  _status text;
  _reason text;
  _report_text text;
  _report_json jsonb;
  _snapshot_count int;
  _peer_count int;
  _sender_count int;
  _has_peer_realtime boolean;
  _has_tab_snapshot boolean;
BEGIN
  SELECT * INTO _row
  FROM public.chat_send_operations
  WHERE operation_id = _operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'operation-not-found');
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
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'invalid-chat-operation-identity');
  END IF;

  IF _row.sender_user_id <> auth.uid() AND NOT public.user_is_in_game(_row.game_id) THEN
    RAISE EXCEPTION 'Not in chat operation game';
  END IF;

  _row.tab_attention_snapshots := COALESCE(_row.tab_attention_snapshots, '[]'::jsonb) || COALESCE(_extra_snapshots, '[]'::jsonb);
  _snapshot_count := jsonb_array_length(COALESCE(_row.tab_attention_snapshots, '[]'::jsonb));
  _peer_count := jsonb_array_length(COALESCE(_row.peer_milestones, '[]'::jsonb));
  _sender_count := jsonb_array_length(COALESCE(_row.sender_milestones, '[]'::jsonb));

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(_row.peer_milestones, '[]'::jsonb)) AS e
    WHERE e->>'phase' IN ('REALTIME_RECEIPT', 'SHELL_TAB_ATTENTION_SNAPSHOT')
  ) INTO _has_peer_realtime;

  _has_tab_snapshot := _snapshot_count > 0;

  _status := COALESCE(
    _terminal_status,
    _row.terminal_status,
    CASE
      WHEN _has_peer_realtime AND _has_tab_snapshot THEN 'peer-received'
      ELSE 'send-complete'
    END
  );
  _reason := COALESCE(_terminal_reason, _row.terminal_reason, _status);

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
    'game_id', _row.game_id,
    'session_id', _row.session_id,
    'route', _row.route,
    'active_tab', _row.active_tab,
    'shell_phase', _row.shell_phase,
    'origin_surface', _row.origin_surface,
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
    'snapshot_count', _snapshot_count,
    'peer_milestone_count', _peer_count,
    'sender_milestone_count', _sender_count,
    'has_peer_realtime_receipt', _has_peer_realtime,
    'has_tab_attention_snapshot', _has_tab_snapshot
  );

  _report_text :=
    'CHAT SEND INCIDENT REPORT' || E'\n' ||
    '=========================' || E'\n' ||
    'Operation type              : chat_send' || E'\n' ||
    'Operation id                : ' || _row.operation_id || E'\n' ||
    'Source kind                 : ' || _row.source_kind || E'\n' ||
    'Terminal status             : ' || _status || E'\n' ||
    'Terminal reason             : ' || _reason || E'\n' ||
    'Game id                     : ' || _row.game_id::text || E'\n' ||
    'Session id                  : ' || _row.session_id || E'\n' ||
    'Route                       : ' || _row.route || E'\n' ||
    'Origin surface              : ' || COALESCE(_row.origin_surface, '(none)') || E'\n' ||
    'Active tab at open          : ' || COALESCE(_row.active_tab, '(none)') || E'\n' ||
    'Shell phase                 : ' || COALESCE(_row.shell_phase, '(none)') || E'\n' ||
    'Started at                  : ' || _row.started_at::text || E'\n' ||
    'Completed at                : ' || COALESCE(_row.completed_at::text, '(none)') || E'\n' ||
    'Message id                  : ' || COALESCE(_row.message_id::text, '(none)') || E'\n' ||
    'Sender milestones           : ' || _sender_count::text || E'\n' ||
    'Peer milestones             : ' || _peer_count::text || E'\n' ||
    'Tab-attention snapshots     : ' || _snapshot_count::text || E'\n' ||
    'Has peer realtime receipt   : ' || CASE WHEN _has_peer_realtime THEN 'yes' ELSE 'no' END || E'\n' ||
    'Has tab-attention snapshot  : ' || CASE WHEN _has_tab_snapshot THEN 'yes' ELSE 'no' END || E'\n' ||
    E'\n' ||
    'SENDER MILESTONES' || E'\n' ||
    COALESCE(jsonb_pretty(_row.sender_milestones), '[]') || E'\n' ||
    E'\n' ||
    'PEER MILESTONES' || E'\n' ||
    COALESCE(jsonb_pretty(_row.peer_milestones), '[]') || E'\n' ||
    E'\n' ||
    'SHELL TAB ATTENTION SNAPSHOTS' || E'\n' ||
    COALESCE(jsonb_pretty(_row.tab_attention_snapshots), '[]') || E'\n';

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
    'report_json', _report_json
  );
END;
$$;