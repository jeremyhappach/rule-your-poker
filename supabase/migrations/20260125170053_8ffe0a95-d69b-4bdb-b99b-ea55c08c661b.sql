-- Create dealer_games table to store each game configuration within a session
CREATE TABLE public.dealer_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  dealer_user_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for efficient querying by session
CREATE INDEX idx_dealer_games_session_id ON public.dealer_games(session_id);

-- Add foreign key constraint to game_results.dealer_game_id
ALTER TABLE public.game_results 
ADD CONSTRAINT fk_game_results_dealer_game 
FOREIGN KEY (dealer_game_id) REFERENCES public.dealer_games(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.dealer_games ENABLE ROW LEVEL SECURITY;

-- RLS policies: anyone in the game can view, players can insert
CREATE POLICY "Anyone can view dealer games" 
ON public.dealer_games 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can insert dealer games" 
ON public.dealer_games 
FOR INSERT 
WITH CHECK (auth.uid() = dealer_user_id);

-- Enable realtime for dealer_games
ALTER PUBLICATION supabase_realtime ADD TABLE public.dealer_games;