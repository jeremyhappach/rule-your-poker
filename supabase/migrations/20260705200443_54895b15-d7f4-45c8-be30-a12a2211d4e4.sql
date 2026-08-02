CREATE TABLE public.chat_send_operations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id text NOT NULL UNIQUE,
  operation_type text NOT NULL DEFAULT 'chat_send',
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_client_instance_id text,
  sender_tab_session_id text,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  dealer_game_id uuid,
  route text NOT NULL,
  active_tab text,
  shell_phase text,
  origin_surface text,
  message_id uuid,
  optimistic_message_id text,
  message_preview text,
  source_kind text NOT NULL DEFAULT 'real',
  status text NOT NULL DEFAULT 'open',
  terminal_status text,
  terminal_reason text,
  sender_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  peer_milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  tab_attention_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  report_status text NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_send_operations_type_check CHECK (operation_type = 'chat_send'),
  CONSTRAINT chat_send_operations_source_check CHECK (source_kind = 'real'),
  CONSTRAINT chat_send_operations_route_check CHECK (route <> '/'),
  CONSTRAINT chat_send_operations_identity_check CHECK (game_id IS NOT NULL AND session_id IS NOT NULL AND length(session_id) > 0)
);

GRANT SELECT, INSERT, UPDATE ON public.chat_send_operations TO authenticated;
GRANT ALL ON public.chat_send_operations TO service_role;

ALTER TABLE public.chat_send_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat participants can view chat operations"
ON public.chat_send_operations
FOR SELECT
TO authenticated
USING (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
);

CREATE POLICY "Users can open their own chat operations"
ON public.chat_send_operations
FOR INSERT
TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  AND public.user_is_in_game(game_id)
  AND operation_type = 'chat_send'
  AND source_kind = 'real'
  AND route <> '/'
);

CREATE POLICY "Table participants can append chat operation evidence"
ON public.chat_send_operations
FOR UPDATE
TO authenticated
USING (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
)
WITH CHECK (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
);

CREATE TABLE public.chat_operation_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operation_id text NOT NULL UNIQUE REFERENCES public.chat_send_operations(operation_id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  terminal_status text NOT NULL,
  report_text text NOT NULL,
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_operation_reports TO authenticated;
GRANT INSERT, UPDATE ON public.chat_operation_reports TO authenticated;
GRANT ALL ON public.chat_operation_reports TO service_role;

ALTER TABLE public.chat_operation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat participants can view chat operation reports"
ON public.chat_operation_reports
FOR SELECT
TO authenticated
USING (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
);

CREATE POLICY "Chat participants can create chat operation reports"
ON public.chat_operation_reports
FOR INSERT
TO authenticated
WITH CHECK (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
);

CREATE POLICY "Chat participants can update chat operation reports"
ON public.chat_operation_reports
FOR UPDATE
TO authenticated
USING (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
)
WITH CHECK (
  sender_user_id = auth.uid()
  OR public.user_is_in_game(game_id)
);

CREATE TRIGGER handle_chat_send_operations_updated_at
BEFORE UPDATE ON public.chat_send_operations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_chat_operation_reports_updated_at
BEFORE UPDATE ON public.chat_operation_reports
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.chat_operation_append_sender_milestone(
  _operation_id text,
  _phase text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _message_id uuid DEFAULT NULL,
  _optimistic_message_id text DEFAULT NULL
)
RETURNS public.chat_send_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.chat_send_operations%ROWTYPE;
  _event jsonb;
BEGIN
  SELECT * INTO _row
  FROM public.chat_send_operations
  WHERE operation_id = _operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat operation not found';
  END IF;

  IF _row.sender_user_id <> auth.uid() AND NOT public.user_is_in_game(_row.game_id) THEN
    RAISE EXCEPTION 'Not in chat operation game';
  END IF;

  _event := jsonb_build_object(
    'phase', _phase,
    'at', now(),
    'actor_user_id', auth.uid(),
    'metadata', COALESCE(_metadata, '{}'::jsonb)
  );

  UPDATE public.chat_send_operations
  SET sender_milestones = COALESCE(sender_milestones, '[]'::jsonb) || jsonb_build_array(_event),
      message_id = COALESCE(_message_id, message_id),
      optimistic_message_id = COALESCE(_optimistic_message_id, optimistic_message_id),
      updated_at = now()
  WHERE operation_id = _operation_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_operation_append_peer_milestone(
  _operation_id text,
  _phase text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _message_id uuid DEFAULT NULL,
  _snapshots jsonb DEFAULT '[]'::jsonb
)
RETURNS public.chat_send_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row public.chat_send_operations%ROWTYPE;
  _event jsonb;
BEGIN
  SELECT * INTO _row
  FROM public.chat_send_operations
  WHERE operation_id = _operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat operation not found';
  END IF;

  IF NOT public.user_is_in_game(_row.game_id) THEN
    RAISE EXCEPTION 'Not in chat operation game';
  END IF;

  _event := jsonb_build_object(
    'phase', _phase,
    'at', now(),
    'actor_user_id', auth.uid(),
    'metadata', COALESCE(_metadata, '{}'::jsonb)
  );

  UPDATE public.chat_send_operations
  SET peer_milestones = COALESCE(peer_milestones, '[]'::jsonb) || jsonb_build_array(_event),
      tab_attention_snapshots = COALESCE(tab_attention_snapshots, '[]'::jsonb) || COALESCE(_snapshots, '[]'::jsonb),
      message_id = COALESCE(_message_id, message_id),
      updated_at = now()
  WHERE operation_id = _operation_id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_chat_send_operation(
  _operation_id text,
  _terminal_status text DEFAULT NULL,
  _terminal_reason text DEFAULT NULL,
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
BEGIN
  SELECT * INTO _row
  FROM public.chat_send_operations
  WHERE operation_id = _operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'rejected', 'reason', 'operation-not-found');
  END IF;

  IF _row.sender_user_id <> auth.uid() AND NOT public.user_is_in_game(_row.game_id) THEN
    RAISE EXCEPTION 'Not in chat operation game';
  END IF;

  _status := COALESCE(_terminal_status, _row.terminal_status, 'send-complete');
  _reason := COALESCE(_terminal_reason, _row.terminal_reason, _status);

  _row.tab_attention_snapshots := COALESCE(_row.tab_attention_snapshots, '[]'::jsonb) || COALESCE(_extra_snapshots, '[]'::jsonb);
  _snapshot_count := jsonb_array_length(COALESCE(_row.tab_attention_snapshots, '[]'::jsonb));
  _peer_count := jsonb_array_length(COALESCE(_row.peer_milestones, '[]'::jsonb));
  _sender_count := jsonb_array_length(COALESCE(_row.sender_milestones, '[]'::jsonb));

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
    'terminal_status', _status,
    'terminal_reason', _reason,
    'game_id', _row.game_id,
    'session_id', _row.session_id,
    'route', _row.route,
    'active_tab', _row.active_tab,
    'shell_phase', _row.shell_phase,
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
    'sender_milestone_count', _sender_count
  );

  _report_text :=
    'CHAT SEND INCIDENT REPORT' || E'\n' ||
    '=========================' || E'\n' ||
    'Operation type              : chat_send' || E'\n' ||
    'Operation id                : ' || _row.operation_id || E'\n' ||
    'Terminal status             : ' || _status || E'\n' ||
    'Terminal reason             : ' || _reason || E'\n' ||
    'Game id                     : ' || _row.game_id::text || E'\n' ||
    'Session id                  : ' || _row.session_id || E'\n' ||
    'Route                       : ' || _row.route || E'\n' ||
    'Active tab at open          : ' || COALESCE(_row.active_tab, '(none)') || E'\n' ||
    'Shell phase                 : ' || COALESCE(_row.shell_phase, '(none)') || E'\n' ||
    'Started at                  : ' || _row.started_at::text || E'\n' ||
    'Completed at                : ' || COALESCE(_row.completed_at::text, '(none)') || E'\n' ||
    'Message id                  : ' || COALESCE(_row.message_id::text, '(none)') || E'\n' ||
    'Sender milestones           : ' || _sender_count::text || E'\n' ||
    'Peer milestones             : ' || _peer_count::text || E'\n' ||
    'Tab-attention snapshots     : ' || _snapshot_count::text || E'\n' ||
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

CREATE INDEX chat_send_operations_game_session_created_idx
ON public.chat_send_operations (game_id, session_id, created_at DESC);

CREATE INDEX chat_operation_reports_game_session_finalized_idx
ON public.chat_operation_reports (game_id, session_id, finalized_at DESC);
