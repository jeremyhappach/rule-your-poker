
CREATE TABLE IF NOT EXISTS public.client_runtime_incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id text NOT NULL UNIQUE,
  incident_row_id uuid,
  user_id uuid,
  original_client_instance_id text,
  original_tab_session_id text,
  original_origin text,
  original_route text,
  recovery_client_instance_id text,
  recovery_tab_session_id text,
  recovery_origin text,
  recovery_route text,
  report_status text NOT NULL DEFAULT 'pending',
  first_event jsonb,
  last_confirmed_local_event jsonb,
  last_capsule_event jsonb,
  last_server_event jsonb,
  last_outbox_result jsonb,
  last_incident_patch jsonb,
  last_instance_heartbeat jsonb,
  recovery_status jsonb,
  network_findings jsonb,
  lifecycle_findings jsonb,
  route_findings jsonb,
  auth_findings jsonb,
  session_findings jsonb,
  missing_boundaries jsonb,
  timeline jsonb,
  narrative text,
  data_completeness jsonb,
  event_count integer NOT NULL DEFAULT 0,
  outbox_count integer NOT NULL DEFAULT 0,
  last_generated_reason text,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_runtime_incident_reports_user_idx
  ON public.client_runtime_incident_reports (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS client_runtime_incident_reports_status_idx
  ON public.client_runtime_incident_reports (report_status, updated_at DESC);

GRANT SELECT ON public.client_runtime_incident_reports TO authenticated;
GRANT ALL    ON public.client_runtime_incident_reports TO service_role;

ALTER TABLE public.client_runtime_incident_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own incident reports"
  ON public.client_runtime_incident_reports
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role) OR is_admin(auth.uid()));

CREATE POLICY "users ack own incident reports"
  ON public.client_runtime_incident_reports
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_client_runtime_incident_reports_updated_at
BEFORE UPDATE ON public.client_runtime_incident_reports
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
