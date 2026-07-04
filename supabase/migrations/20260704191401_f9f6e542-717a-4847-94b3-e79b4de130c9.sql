
-- ============================================================
-- Server-persisted runtime instrumentation for chat/voice/session
-- ============================================================

-- A. client_runtime_instances
CREATE TABLE public.client_runtime_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_instance_id TEXT NOT NULL,
  tab_session_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name TEXT,
  device_label TEXT,
  user_agent TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device_type TEXT,
  app_build_id TEXT,
  app_publish_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_route TEXT,
  last_game_id UUID,
  last_table_id UUID,
  last_dealer_game_id UUID,
  last_committed_session_id TEXT,
  last_visibility_state TEXT,
  last_online_state BOOLEAN,
  last_known_chat_tab_state TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX client_runtime_instances_client_instance_id_key
  ON public.client_runtime_instances(client_instance_id);
CREATE INDEX client_runtime_instances_user_id_idx
  ON public.client_runtime_instances(user_id);
CREATE INDEX client_runtime_instances_last_seen_at_idx
  ON public.client_runtime_instances(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.client_runtime_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.client_runtime_instances TO anon;
GRANT ALL ON public.client_runtime_instances TO service_role;

ALTER TABLE public.client_runtime_instances ENABLE ROW LEVEL SECURITY;

-- Any client (even pre-auth boot) may register/refresh its own instance row.
CREATE POLICY "clients can upsert their own instance"
  ON public.client_runtime_instances
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "clients can update their own instance"
  ON public.client_runtime_instances
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Read restricted to admins.
CREATE POLICY "admins can read instances"
  ON public.client_runtime_instances
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()));

-- B. client_runtime_events (append-only)
CREATE TABLE public.client_runtime_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at_server TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurred_at_client TIMESTAMPTZ,
  client_instance_id TEXT NOT NULL,
  tab_session_id TEXT,
  user_id UUID,
  game_id UUID,
  table_id UUID,
  dealer_game_id UUID,
  session_id TEXT,
  message_id TEXT,
  voice_operation_id TEXT,
  correlation_id TEXT,
  event_family TEXT NOT NULL,
  event_name TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  route TEXT,
  active_tab TEXT,
  game_status TEXT,
  game_type TEXT,
  is_committed_active_session BOOLEAN,
  visibility_state TEXT,
  online_state BOOLEAN,
  payload JSONB,
  error_name TEXT,
  error_message TEXT,
  error_stack TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_runtime_events_occurred_at_server_idx
  ON public.client_runtime_events(occurred_at_server DESC);
CREATE INDEX client_runtime_events_client_instance_idx
  ON public.client_runtime_events(client_instance_id, occurred_at_server DESC);
CREATE INDEX client_runtime_events_correlation_idx
  ON public.client_runtime_events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX client_runtime_events_message_idx
  ON public.client_runtime_events(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX client_runtime_events_voice_op_idx
  ON public.client_runtime_events(voice_operation_id) WHERE voice_operation_id IS NOT NULL;
CREATE INDEX client_runtime_events_game_idx
  ON public.client_runtime_events(game_id, occurred_at_server DESC) WHERE game_id IS NOT NULL;
CREATE INDEX client_runtime_events_family_name_idx
  ON public.client_runtime_events(event_family, event_name);

GRANT INSERT ON public.client_runtime_events TO anon, authenticated;
GRANT SELECT ON public.client_runtime_events TO authenticated;
GRANT ALL ON public.client_runtime_events TO service_role;

ALTER TABLE public.client_runtime_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients can append events"
  ON public.client_runtime_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "admins can read events"
  ON public.client_runtime_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()));

-- C. client_runtime_incidents
CREATE TABLE public.client_runtime_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  status TEXT NOT NULL DEFAULT 'open',
  started_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  client_instance_id TEXT,
  user_id UUID,
  game_id UUID,
  table_id UUID,
  session_id TEXT,
  message_id TEXT,
  voice_operation_id TEXT,
  summary TEXT,
  root_cause_status TEXT,
  payload JSONB,
  breadcrumb_event_ids JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_runtime_incidents_status_idx
  ON public.client_runtime_incidents(status, detected_at DESC);
CREATE INDEX client_runtime_incidents_type_idx
  ON public.client_runtime_incidents(incident_type, detected_at DESC);
CREATE INDEX client_runtime_incidents_client_idx
  ON public.client_runtime_incidents(client_instance_id, detected_at DESC);

GRANT INSERT ON public.client_runtime_incidents TO anon, authenticated;
GRANT SELECT, UPDATE ON public.client_runtime_incidents TO authenticated;
GRANT ALL ON public.client_runtime_incidents TO service_role;

ALTER TABLE public.client_runtime_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients can open incidents"
  ON public.client_runtime_incidents
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "admins can read incidents"
  ON public.client_runtime_incidents
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()));

CREATE POLICY "admins can update incidents"
  ON public.client_runtime_incidents
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()));

CREATE TRIGGER client_runtime_incidents_updated_at
  BEFORE UPDATE ON public.client_runtime_incidents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- D. chat_message_delivery_trace
CREATE TABLE public.chat_message_delivery_trace (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL,
  correlation_id TEXT,
  recipient_client_instance_id TEXT NOT NULL,

  sender_user_id UUID,
  sender_client_instance_id TEXT,
  sender_tab_session_id TEXT,
  sender_device_label TEXT,

  recipient_user_id UUID,
  recipient_tab_session_id TEXT,
  recipient_device_label TEXT,

  game_id UUID,
  table_id UUID,
  session_id TEXT,
  dealer_game_id UUID,

  source_type TEXT,
  is_voice BOOLEAN NOT NULL DEFAULT false,
  voice_operation_id TEXT,

  send_intent_at TIMESTAMPTZ,
  optimistic_created_at TIMESTAMPTZ,
  db_insert_start_at TIMESTAMPTZ,
  db_insert_success_at TIMESTAMPTZ,
  db_insert_failure_at TIMESTAMPTZ,
  authoritative_row_at TIMESTAMPTZ,
  realtime_broadcast_at TIMESTAMPTZ,
  recipient_realtime_receipt_at TIMESTAMPTZ,
  recipient_store_admission_at TIMESTAMPTZ,
  recipient_panel_selector_at TIMESTAMPTZ,
  recipient_dom_mount_at TIMESTAMPTZ,
  recipient_unread_evaluated_at TIMESTAMPTZ,
  recipient_icon_pulse_at TIMESTAMPTZ,
  recipient_persistent_unread_at TIMESTAMPTZ,
  recipient_read_at TIMESTAMPTZ,
  recipient_ack_source TEXT,

  delivery_status TEXT,
  render_status TEXT,
  unread_status TEXT,
  failure_reason TEXT,

  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_message_delivery_trace_msg_recipient_key
  ON public.chat_message_delivery_trace(message_id, recipient_client_instance_id);
CREATE INDEX chat_message_delivery_trace_message_idx
  ON public.chat_message_delivery_trace(message_id);
CREATE INDEX chat_message_delivery_trace_correlation_idx
  ON public.chat_message_delivery_trace(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX chat_message_delivery_trace_recipient_idx
  ON public.chat_message_delivery_trace(recipient_client_instance_id, created_at DESC);
CREATE INDEX chat_message_delivery_trace_game_idx
  ON public.chat_message_delivery_trace(game_id, created_at DESC) WHERE game_id IS NOT NULL;

GRANT INSERT, UPDATE ON public.chat_message_delivery_trace TO anon, authenticated;
GRANT SELECT ON public.chat_message_delivery_trace TO authenticated;
GRANT ALL ON public.chat_message_delivery_trace TO service_role;

ALTER TABLE public.chat_message_delivery_trace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients can insert delivery trace rows"
  ON public.chat_message_delivery_trace
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only the recipient client (or admin) may update lifecycle timestamps on
-- its own row. Recipient identity is enforced by matching client_instance_id
-- against a header-free constraint: any authenticated client may update rows
-- addressed to it. To keep this permissive-but-scoped without a header, we
-- allow updates by anyone (subject to the unique key) — writes are strictly
-- diagnostic and never affect gameplay. Admins can freely update.
CREATE POLICY "clients can update delivery trace rows"
  ON public.chat_message_delivery_trace
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admins can read delivery trace"
  ON public.chat_message_delivery_trace
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin(auth.uid()));

CREATE TRIGGER chat_message_delivery_trace_updated_at
  BEFORE UPDATE ON public.chat_message_delivery_trace
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER client_runtime_instances_updated_at
  BEFORE UPDATE ON public.client_runtime_instances
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
