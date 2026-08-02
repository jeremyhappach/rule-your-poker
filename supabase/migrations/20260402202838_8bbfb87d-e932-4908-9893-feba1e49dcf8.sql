
CREATE TABLE public.debug_sync_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  game_id uuid NOT NULL,
  game_type text NOT NULL,
  hand_number integer NOT NULL DEFAULT 0,
  round_id uuid,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  event_name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.debug_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert sync debug events"
  ON public.debug_sync_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read sync debug events"
  ON public.debug_sync_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete sync debug events"
  ON public.debug_sync_events FOR DELETE TO authenticated
  USING (true);

CREATE INDEX idx_debug_sync_events_game_created
  ON public.debug_sync_events (game_id, created_at DESC);

CREATE INDEX idx_debug_sync_events_type_created
  ON public.debug_sync_events (event_type, created_at DESC);
