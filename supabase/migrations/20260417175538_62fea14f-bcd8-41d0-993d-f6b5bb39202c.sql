
-- Add network simulation settings to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS network_sim_mode text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS network_sim_logging boolean NOT NULL DEFAULT false;

-- Constrain mode values
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_network_sim_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_network_sim_mode_check
  CHECK (network_sim_mode IN ('off', 'moderate', 'heavy', 'reorder', 'cross_country'));

-- Create network_sim_events table
CREATE TABLE IF NOT EXISTS public.network_sim_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  game_id uuid,
  round_id uuid,
  hand_number integer,
  sim_mode text NOT NULL,
  event_type text NOT NULL,
  source text,
  original_receive_ts timestamptz,
  actual_delivery_ts timestamptz,
  delay_ms integer,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_network_sim_events_user_created
  ON public.network_sim_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_sim_events_game
  ON public.network_sim_events (game_id, created_at DESC);

ALTER TABLE public.network_sim_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own sim events" ON public.network_sim_events;
CREATE POLICY "Users can insert own sim events"
  ON public.network_sim_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own sim events" ON public.network_sim_events;
CREATE POLICY "Users can view own sim events"
  ON public.network_sim_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all sim events" ON public.network_sim_events;
CREATE POLICY "Admins can view all sim events"
  ON public.network_sim_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
