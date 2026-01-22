-- Add unique constraint on (game_id, hand_number, round_number) to prevent duplicate rounds
-- This enables atomic "insert-as-lock" pattern for ante/tax collection in human-vs-human games
CREATE UNIQUE INDEX IF NOT EXISTS rounds_game_hand_round_unique 
ON public.rounds (game_id, hand_number, round_number)
WHERE hand_number IS NOT NULL;