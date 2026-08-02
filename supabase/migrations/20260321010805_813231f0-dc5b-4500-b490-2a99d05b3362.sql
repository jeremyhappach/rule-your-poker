
CREATE TABLE public.debug_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  game_id uuid NOT NULL,
  round_id uuid,
  user_id uuid,
  client_role text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.debug_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert debug events"
ON public.debug_events FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Anyone can read debug events"
ON public.debug_events FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Anyone can delete debug events"
ON public.debug_events FOR DELETE
TO authenticated
USING (true);

CREATE INDEX idx_debug_events_game_id ON public.debug_events (game_id);
CREATE INDEX idx_debug_events_created_at ON public.debug_events (created_at DESC);
CREATE INDEX idx_debug_events_event_type ON public.debug_events (event_type);
