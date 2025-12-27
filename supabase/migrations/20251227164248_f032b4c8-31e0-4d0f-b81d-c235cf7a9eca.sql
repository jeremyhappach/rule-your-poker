-- Create session player snapshots table
CREATE TABLE public.session_player_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  chips INT NOT NULL,
  is_bot BOOLEAN DEFAULT false,
  hand_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX idx_session_snapshots_game_user ON public.session_player_snapshots(game_id, user_id);
CREATE INDEX idx_session_snapshots_game_hand ON public.session_player_snapshots(game_id, hand_number);

-- Enable RLS
ALTER TABLE public.session_player_snapshots ENABLE ROW LEVEL SECURITY;

-- Anyone can view snapshots (needed for results display)
CREATE POLICY "Anyone can view snapshots"
ON public.session_player_snapshots
FOR SELECT
USING (true);

-- Anyone can insert snapshots (game logic needs this)
CREATE POLICY "Anyone can insert snapshots"
ON public.session_player_snapshots
FOR INSERT
WITH CHECK (true);

-- Enable realtime for snapshots
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_player_snapshots;