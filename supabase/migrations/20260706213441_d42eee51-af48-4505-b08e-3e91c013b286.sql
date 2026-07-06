
-- =========================================================================
-- 1) Pause runaway cron jobs (via cron.alter_job — allowed to migration role)
-- =========================================================================
SELECT cron.alter_job(job_id := 7, active := false);  -- enforce-all-deadlines-every-30s
SELECT cron.alter_job(job_id := 9, active := false);  -- finalize-voice-operations-5s
-- Rollback:
--   SELECT cron.alter_job(job_id := 7, active := true);
--   SELECT cron.alter_job(job_id := 9, active := true);

-- =========================================================================
-- 2) Chat-operation telemetry RPCs → read-only no-op mode
-- =========================================================================
CREATE OR REPLACE FUNCTION public.chat_operation_append_boundary_event(
  _operation_id text, _name text, _role text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN; END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_append_recovery_correlation(
  _operation_id text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN; END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_mark_delivery_confirmed(
  _operation_id text, _kind text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN; END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_sender_heartbeat(
  _operation_id text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN; END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_peer_heartbeat(
  _operation_id text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN; END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_append_sender_milestone(
  _operation_id text, _phase text, _metadata jsonb DEFAULT '{}'::jsonb,
  _message_id uuid DEFAULT NULL, _optimistic_message_id text DEFAULT NULL
) RETURNS public.chat_send_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _r public.chat_send_operations;
BEGIN
  SELECT * INTO _r FROM public.chat_send_operations WHERE operation_id = _operation_id;
  IF NOT FOUND THEN _r.operation_id := _operation_id; END IF;
  RETURN _r;
END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_append_peer_milestone(
  _operation_id text, _phase text, _metadata jsonb DEFAULT '{}'::jsonb,
  _message_id uuid DEFAULT NULL, _snapshots jsonb DEFAULT '[]'::jsonb
) RETURNS public.chat_send_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _r public.chat_send_operations;
BEGIN
  SELECT * INTO _r FROM public.chat_send_operations WHERE operation_id = _operation_id;
  IF NOT FOUND THEN _r.operation_id := _operation_id; END IF;
  RETURN _r;
END; $$;

CREATE OR REPLACE FUNCTION public.chat_operation_append_violation(
  _operation_id text, _name text, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS public.chat_send_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _r public.chat_send_operations;
BEGIN
  SELECT * INTO _r FROM public.chat_send_operations WHERE operation_id = _operation_id;
  IF NOT FOUND THEN _r.operation_id := _operation_id; END IF;
  RETURN _r;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_chat_send_operation(
  _operation_id text,
  _terminal_status text DEFAULT NULL,
  _terminal_reason text DEFAULT NULL,
  _extra_snapshots jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN jsonb_build_object(
    'outcome', 'ok',
    'terminal_status', COALESCE(_terminal_status, 'noop'),
    'noop', true
  );
END; $$;

-- =========================================================================
-- 3) Remove accidental latency probe row (verified: 0 dependents)
-- =========================================================================
DELETE FROM public.games WHERE name = '__latency_probe__';

-- =========================================================================
-- 4) Close anonymous-write hole on public.games
-- =========================================================================
DROP POLICY IF EXISTS "Anyone can create games" ON public.games;
DROP POLICY IF EXISTS "Anyone can update games" ON public.games;
DROP POLICY IF EXISTS "Users can delete own games or empty games" ON public.games;
-- "Anyone can view games" is intentionally retained for the lobby.

CREATE POLICY "Authenticated users can create games"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Seated players can update their game"
  ON public.games FOR UPDATE
  TO authenticated
  USING (public.user_is_in_game(id))
  WITH CHECK (public.user_is_in_game(id));

CREATE POLICY "Seat-1 or empty games deletable by member"
  ON public.games FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.game_id = games.id
        AND players.user_id = auth.uid()
        AND players."position" = 1
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.players WHERE players.game_id = games.id
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.games FROM anon;
GRANT  SELECT                         ON public.games TO anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT  ALL                            ON public.games TO service_role;
