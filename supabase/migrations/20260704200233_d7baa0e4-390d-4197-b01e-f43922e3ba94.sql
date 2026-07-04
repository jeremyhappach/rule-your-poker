-- Replace partial unique index with a full unique index so
-- PostgREST can use it as an ON CONFLICT target.
DROP INDEX IF EXISTS public.client_runtime_incidents_correlation_uidx;
CREATE UNIQUE INDEX client_runtime_incidents_correlation_uidx
  ON public.client_runtime_incidents(correlation_id);

-- Consolidate instance access policies into a single FOR ALL
-- rule. The prior split INSERT+UPDATE pair caused the merge-
-- duplicates upsert path to reject at the RLS layer.
DROP POLICY IF EXISTS "clients can upsert their own instance"
  ON public.client_runtime_instances;
DROP POLICY IF EXISTS "clients can update their own instance"
  ON public.client_runtime_instances;
CREATE POLICY "clients can write their own instance"
  ON public.client_runtime_instances
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Same consolidation for outbox INSERT+UPDATE.
DROP POLICY IF EXISTS "clients can append outbox"
  ON public.client_runtime_event_outbox;
DROP POLICY IF EXISTS "clients can update outbox"
  ON public.client_runtime_event_outbox;
CREATE POLICY "clients can write outbox"
  ON public.client_runtime_event_outbox
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Same consolidation for incidents (INSERT + client UPDATE).
DROP POLICY IF EXISTS "clients can open incidents"
  ON public.client_runtime_incidents;
DROP POLICY IF EXISTS "clients can update their own incidents"
  ON public.client_runtime_incidents;
CREATE POLICY "clients can write incidents"
  ON public.client_runtime_incidents
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
