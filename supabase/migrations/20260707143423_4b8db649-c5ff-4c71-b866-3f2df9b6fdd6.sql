
-- 1. Per-game diagnostic session (auto-armed on game creation / waiting-table entry).
CREATE TABLE IF NOT EXISTS public.chat_diagnostic_sessions (
  game_id uuid PRIMARY KEY,
  diagnostic_session_id uuid NOT NULL DEFAULT gen_random_uuid(),
  armed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_diagnostic_sessions TO authenticated;
GRANT ALL ON public.chat_diagnostic_sessions TO service_role;
ALTER TABLE public.chat_diagnostic_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read diag sessions" ON public.chat_diagnostic_sessions;
CREATE POLICY "auth read diag sessions"
  ON public.chat_diagnostic_sessions
  FOR SELECT TO authenticated USING (true);

-- 2. Allow players of a game (or admins) to read diagnostic events for that game.
DROP POLICY IF EXISTS "players read diag events for their game"
  ON public.chat_message_diagnostic_events;
CREATE POLICY "players read diag events for their game"
  ON public.chat_message_diagnostic_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.players p
      WHERE p.game_id = chat_message_diagnostic_events.game_id
        AND p.user_id = auth.uid()
    )
  );

-- 3. Idempotent ensure-session RPC. Returns the diagnostic session for a game,
--    creating it (auto-armed for 15 minutes) on first call.
CREATE OR REPLACE FUNCTION public.ensure_chat_diagnostic_session(_game_id uuid)
RETURNS TABLE(diagnostic_session_id uuid, armed_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _game_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_diagnostic_sessions(game_id)
    VALUES (_game_id)
    ON CONFLICT (game_id) DO NOTHING;

  RETURN QUERY
    SELECT s.diagnostic_session_id, s.armed_at, s.expires_at
    FROM public.chat_diagnostic_sessions s
    WHERE s.game_id = _game_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_chat_diagnostic_session(uuid) TO authenticated;

-- 4. Rewrite the event recorder to gate on chat_diagnostic_sessions.
CREATE OR REPLACE FUNCTION public.record_chat_flight_event(
  _diagnostic_session_id uuid,
  _client_message_id uuid,
  _game_id uuid,
  _session_id text,
  _client_role text,
  _event_sequence integer,
  _monotonic_ms double precision,
  _event_name text,
  _source_file text,
  _source_function text,
  _reason text,
  _state_snapshot jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sess public.chat_diagnostic_sessions%ROWTYPE;
  _per_msg_count int;
  _per_session_count int;
BEGIN
  BEGIN
    IF _diagnostic_session_id IS NULL OR _game_id IS NULL THEN
      RETURN;
    END IF;

    SELECT * INTO _sess
      FROM public.chat_diagnostic_sessions
      WHERE diagnostic_session_id = _diagnostic_session_id
        AND game_id = _game_id
      LIMIT 1;

    IF _sess.diagnostic_session_id IS NULL THEN
      RETURN;
    END IF;

    IF _sess.expires_at IS NOT NULL AND now() > _sess.expires_at THEN
      RETURN;
    END IF;

    IF _client_role NOT IN ('sender','receiver') THEN
      RETURN;
    END IF;

    -- Per client_message_id cap: 80 events.
    IF _client_message_id IS NOT NULL THEN
      SELECT count(*) INTO _per_msg_count
        FROM public.chat_message_diagnostic_events
        WHERE client_message_id = _client_message_id;
      IF _per_msg_count >= 80 THEN RETURN; END IF;
    END IF;

    -- Per session cap: 3 distinct sender client_message_ids per diagnostic_session.
    IF _client_role = 'sender' AND _client_message_id IS NOT NULL THEN
      SELECT count(DISTINCT client_message_id) INTO _per_session_count
        FROM public.chat_message_diagnostic_events
        WHERE diagnostic_session_id = _diagnostic_session_id
          AND client_role = 'sender'
          AND client_message_id IS NOT NULL
          AND client_message_id <> _client_message_id;
      IF _per_session_count >= 3 THEN RETURN; END IF;
    END IF;

    INSERT INTO public.chat_message_diagnostic_events (
      diagnostic_session_id, client_message_id, game_id, session_id,
      actor_user_id, client_role, event_sequence, monotonic_ms,
      event_name, source_file, source_function, reason, state_snapshot
    ) VALUES (
      _diagnostic_session_id, _client_message_id, _game_id, _session_id,
      auth.uid(), _client_role, _event_sequence, _monotonic_ms,
      _event_name, _source_file, _source_function, _reason,
      COALESCE(_state_snapshot,'{}'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
END;
$$;

-- 5. Report RPC. Callable by players in the game and admins.
CREATE OR REPLACE FUNCTION public.get_chat_flight_report(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sess public.chat_diagnostic_sessions%ROWTYPE;
  _events jsonb;
  _messages jsonb;
  _authorized boolean;
BEGIN
  IF _game_id IS NULL THEN
    RETURN jsonb_build_object('error','missing_game_id');
  END IF;

  SELECT (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.players p WHERE p.game_id = _game_id AND p.user_id = auth.uid())
  ) INTO _authorized;

  IF NOT COALESCE(_authorized, false) THEN
    RETURN jsonb_build_object('error','not_authorized');
  END IF;

  SELECT * INTO _sess
    FROM public.chat_diagnostic_sessions
    WHERE game_id = _game_id
    LIMIT 1;

  IF _sess.diagnostic_session_id IS NULL THEN
    RETURN jsonb_build_object('error','no_session', 'game_id', _game_id);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(e)::jsonb ORDER BY e.wall_clock_at, e.event_sequence), '[]'::jsonb)
    INTO _events
    FROM public.chat_message_diagnostic_events e
    WHERE e.diagnostic_session_id = _sess.diagnostic_session_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'client_message_id', m.client_message_id,
      'id', m.id,
      'user_id', m.user_id,
      'created_at', m.created_at,
      'has_content', (m.message IS NOT NULL AND length(m.message) > 0),
      'message_length', COALESCE(length(m.message), 0)
    )), '[]'::jsonb)
    INTO _messages
    FROM public.chat_messages m
    WHERE m.game_id = _game_id
      AND m.client_message_id IS NOT NULL
      AND m.client_message_id IN (
        SELECT DISTINCT client_message_id
        FROM public.chat_message_diagnostic_events
        WHERE diagnostic_session_id = _sess.diagnostic_session_id
          AND client_message_id IS NOT NULL
      );

  RETURN jsonb_build_object(
    'session', jsonb_build_object(
      'game_id', _sess.game_id,
      'diagnostic_session_id', _sess.diagnostic_session_id,
      'armed_at', _sess.armed_at,
      'expires_at', _sess.expires_at
    ),
    'events', _events,
    'durable_messages', _messages,
    'exported_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_chat_flight_report(uuid) TO authenticated;
