
-- 1. Durable correlation id on chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_message_id_key
  ON public.chat_messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

-- 2. Bounded diagnostic event table
CREATE TABLE IF NOT EXISTS public.chat_message_diagnostic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnostic_session_id uuid NOT NULL,
  client_message_id uuid,
  game_id uuid,
  session_id text,
  actor_user_id uuid,
  client_role text NOT NULL CHECK (client_role IN ('sender','receiver')),
  event_sequence integer NOT NULL,
  wall_clock_at timestamptz NOT NULL DEFAULT now(),
  monotonic_ms double precision,
  event_name text NOT NULL,
  source_file text,
  source_function text,
  reason text,
  state_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.chat_message_diagnostic_events TO authenticated;
GRANT ALL ON public.chat_message_diagnostic_events TO service_role;
ALTER TABLE public.chat_message_diagnostic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read diagnostic events"
  ON public.chat_message_diagnostic_events
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS chat_diag_events_client_msg_idx
  ON public.chat_message_diagnostic_events (client_message_id, event_sequence);
CREATE INDEX IF NOT EXISTS chat_diag_events_session_idx
  ON public.chat_message_diagnostic_events (diagnostic_session_id, wall_clock_at);

-- 3. Arming row lives in system_settings under key 'chat_flight_recorder':
--    { enabled: bool, game_id: uuid, armed_at: iso, expires_at: iso }
-- Server-side arming check + caps enforced in the RPC below.
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
  _cfg jsonb;
  _armed_game uuid;
  _expires timestamptz;
  _per_msg_count int;
  _per_session_count int;
BEGIN
  -- Never raise: instrumentation must never affect the caller.
  BEGIN
    SELECT value INTO _cfg
      FROM public.system_settings
      WHERE key = 'chat_flight_recorder'
      LIMIT 1;

    IF _cfg IS NULL OR COALESCE((_cfg->>'enabled')::boolean, false) = false THEN
      RETURN;
    END IF;

    _armed_game := NULLIF(_cfg->>'game_id','')::uuid;
    _expires := NULLIF(_cfg->>'expires_at','')::timestamptz;

    -- Game scope: if a game_id is armed, all writes must match it.
    IF _armed_game IS NOT NULL AND _game_id IS DISTINCT FROM _armed_game THEN
      RETURN;
    END IF;

    -- Time bound (15 min max — caller sets this).
    IF _expires IS NOT NULL AND now() > _expires THEN
      RETURN;
    END IF;

    -- Client role guard.
    IF _client_role NOT IN ('sender','receiver') THEN RETURN; END IF;

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

GRANT EXECUTE ON FUNCTION public.record_chat_flight_event(
  uuid, uuid, uuid, text, text, integer, double precision, text, text, text, text, jsonb
) TO authenticated;

-- Seed disabled arming row (present but off).
INSERT INTO public.system_settings (key, value)
VALUES ('chat_flight_recorder', jsonb_build_object('enabled', false))
ON CONFLICT (key) DO NOTHING;
