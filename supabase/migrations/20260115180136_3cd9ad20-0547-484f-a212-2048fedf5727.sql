-- Create session events log table for debugging game creation/config issues
CREATE TABLE public.session_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}'::jsonb,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert events
CREATE POLICY "Authenticated users can insert session events"
ON public.session_events
FOR INSERT
WITH CHECK (true);

-- Allow authenticated users to read events
CREATE POLICY "Authenticated users can read session events"
ON public.session_events
FOR SELECT
USING (true);

-- Create index for quick lookups by game_id
CREATE INDEX idx_session_events_game_id ON public.session_events(game_id);
CREATE INDEX idx_session_events_created_at ON public.session_events(created_at DESC);