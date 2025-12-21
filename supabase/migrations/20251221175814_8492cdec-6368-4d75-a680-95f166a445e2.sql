-- Add hand_number to rounds table to track which game/hand each round belongs to
ALTER TABLE public.rounds ADD COLUMN hand_number integer DEFAULT 1;

-- Create game_results table to store summaries when each game ends
CREATE TABLE public.game_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  hand_number integer NOT NULL,
  winner_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  winner_username text,
  winning_hand_description text,
  pot_won integer NOT NULL DEFAULT 0,
  player_chip_changes jsonb NOT NULL DEFAULT '{}',
  is_chopped boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

-- Anyone can view game results
CREATE POLICY "Anyone can view game results"
ON public.game_results
FOR SELECT
USING (true);

-- Anyone can insert game results (game logic inserts these)
CREATE POLICY "Anyone can insert game results"
ON public.game_results
FOR INSERT
WITH CHECK (true);

-- Create index for efficient lookups by game_id
CREATE INDEX idx_game_results_game_id ON public.game_results(game_id);

-- Enable realtime for game_results
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_results;