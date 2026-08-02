ALTER TABLE public.debug_events ALTER COLUMN game_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_debug_events_session_id ON public.debug_events ((payload->>'sessionId'));
