-- Add is_final_round flag to mark the winning round of each game
-- This allows us to preserve the final round permanently while purging older non-final rounds

ALTER TABLE public.rounds ADD COLUMN is_final_round boolean NOT NULL DEFAULT false;

-- Add an index for efficient purge queries
CREATE INDEX idx_rounds_is_final_round ON public.rounds (is_final_round);

-- Add composite index for efficient querying by game_id and is_final_round
CREATE INDEX idx_rounds_game_final ON public.rounds (game_id, is_final_round);

-- Add index on created_at for time-based purge queries
CREATE INDEX idx_rounds_created_at ON public.rounds (created_at);