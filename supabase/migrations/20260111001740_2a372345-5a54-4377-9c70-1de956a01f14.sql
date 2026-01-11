-- Debug timing sessions captured from the client
CREATE TABLE IF NOT EXISTS public.timing_debug_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL DEFAULT 'dice',
  start_time timestamptz NOT NULL,
  end_time timestamptz NULL,
  duration_ms integer NULL,
  app_route text NULL,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshots jsonb NOT NULL DEFAULT '[]'::jsonb,
  client_info jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timing_debug_sessions ENABLE ROW LEVEL SECURITY;

-- Ensure re-runs are safe
DROP POLICY IF EXISTS "Users can insert their own timing sessions" ON public.timing_debug_sessions;
DROP POLICY IF EXISTS "Users can view their own timing sessions" ON public.timing_debug_sessions;
DROP POLICY IF EXISTS "Admins can view all timing sessions" ON public.timing_debug_sessions;

-- Users can write their own sessions
CREATE POLICY "Users can insert their own timing sessions"
ON public.timing_debug_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can read their own sessions
CREATE POLICY "Users can view their own timing sessions"
ON public.timing_debug_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_timing_debug_sessions_user_created
ON public.timing_debug_sessions (user_id, created_at DESC);
