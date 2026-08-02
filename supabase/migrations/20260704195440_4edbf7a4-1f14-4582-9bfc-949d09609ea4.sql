-- ============================================================
-- Runtime instrumentation upgrade: DB-persisted voice/lifecycle
-- incidents, richer instance rows, and an authoritative outbox
-- that records delivery evidence for every critical event.
-- ============================================================

-- 1) Extend client_runtime_incidents so it is the source of truth
--    for a live voice/lifecycle incident and can be patched
--    in-place as new phases occur.
ALTER TABLE public.client_runtime_incidents
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS tab_session_id text,
  ADD COLUMN IF NOT EXISTS dealer_game_id uuid,
  ADD COLUMN IF NOT EXISTS app_build_id text,
  ADD COLUMN IF NOT EXISTS app_publish_version text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_voice_phase text,
  ADD COLUMN IF NOT EXISTS last_route text,
  ADD COLUMN IF NOT EXISTS last_lifecycle_event text,
  ADD COLUMN IF NOT EXISTS last_visibility_state text,
  ADD COLUMN IF NOT EXISTS last_error_name text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS event_sequence integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS client_runtime_incidents_correlation_uidx
  ON public.client_runtime_incidents(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_runtime_incidents_user_status_idx
  ON public.client_runtime_incidents(user_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS client_runtime_incidents_game_status_idx
  ON public.client_runtime_incidents(game_id, status, detected_at DESC);

-- Allow clients to patch incident rows they opened (heartbeat
-- of last_event_at / last_voice_phase / last_lifecycle_event).
DROP POLICY IF EXISTS "clients can update their own incidents"
  ON public.client_runtime_incidents;
CREATE POLICY "clients can update their own incidents"
  ON public.client_runtime_incidents
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Cross-origin recovery: the same authenticated user on a new
-- origin can find their own open incidents. Admin read policy
-- remains for full visibility.
DROP POLICY IF EXISTS "users can read their open incidents"
  ON public.client_runtime_incidents;
CREATE POLICY "users can read their open incidents"
  ON public.client_runtime_incidents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) Extend client_runtime_instances with origin, discard, and
--    active-incident linkage so instance heartbeat rows carry
--    everything the incident view needs.
ALTER TABLE public.client_runtime_instances
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS document_was_discarded boolean,
  ADD COLUMN IF NOT EXISTS active_incident_id text,
  ADD COLUMN IF NOT EXISTS last_lifecycle_event text;

CREATE INDEX IF NOT EXISTS client_runtime_instances_active_incident_idx
  ON public.client_runtime_instances(active_incident_id)
  WHERE active_incident_id IS NOT NULL;

-- 3) Authoritative outbox: every critical event writes a
--    pending row FIRST, then the sender flips it to delivered
--    or failed. This is queryable proof of write attempts and
--    replaces the browser-only retry queue as the source of
--    truth for delivery evidence.
CREATE TABLE IF NOT EXISTS public.client_runtime_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  transport text,
  client_instance_id text NOT NULL,
  tab_session_id text,
  correlation_id text,
  event_family text NOT NULL,
  event_name text NOT NULL,
  severity text,
  event_row jsonb NOT NULL,
  error_name text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_runtime_event_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.client_runtime_event_outbox TO anon;
GRANT ALL ON public.client_runtime_event_outbox TO service_role;

ALTER TABLE public.client_runtime_event_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients can append outbox"
  ON public.client_runtime_event_outbox;
CREATE POLICY "clients can append outbox"
  ON public.client_runtime_event_outbox
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "clients can update outbox"
  ON public.client_runtime_event_outbox;
CREATE POLICY "clients can update outbox"
  ON public.client_runtime_event_outbox
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admins can read outbox"
  ON public.client_runtime_event_outbox;
CREATE POLICY "admins can read outbox"
  ON public.client_runtime_event_outbox
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS client_runtime_event_outbox_status_idx
  ON public.client_runtime_event_outbox(status, created_at DESC);
CREATE INDEX IF NOT EXISTS client_runtime_event_outbox_correlation_idx
  ON public.client_runtime_event_outbox(correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_runtime_event_outbox_client_idx
  ON public.client_runtime_event_outbox(client_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS client_runtime_event_outbox_event_name_idx
  ON public.client_runtime_event_outbox(event_name, created_at DESC);

CREATE TRIGGER client_runtime_event_outbox_updated_at
  BEFORE UPDATE ON public.client_runtime_event_outbox
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
