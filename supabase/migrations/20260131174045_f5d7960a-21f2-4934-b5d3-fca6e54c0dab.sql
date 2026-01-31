-- Create a debug table for tracking all game state changes
CREATE TABLE public.game_state_debug_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  game_id uuid NOT NULL,
  dealer_game_id uuid,
  round_id uuid,
  player_id uuid,
  event_type text NOT NULL,
  -- Snapshot of relevant state at the time of the event
  game_status text,
  round_status text,
  all_decisions_in boolean,
  current_round integer,
  total_hands integer,
  player_decision text,
  decision_locked boolean,
  auto_fold boolean,
  deadline_expired boolean,
  -- Extra context
  source_location text,
  details jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS but allow inserts from authenticated users
ALTER TABLE public.game_state_debug_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert debug logs"
ON public.game_state_debug_log
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can read debug logs"
ON public.game_state_debug_log
FOR SELECT
USING (true);

-- Index for querying by game
CREATE INDEX idx_game_state_debug_log_game_id ON public.game_state_debug_log(game_id);
CREATE INDEX idx_game_state_debug_log_created_at ON public.game_state_debug_log(created_at DESC);