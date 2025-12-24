-- Remove the is_final_round column and its indexes (not needed)
DROP INDEX IF EXISTS idx_rounds_is_final_round;
DROP INDEX IF EXISTS idx_rounds_game_final;
ALTER TABLE public.rounds DROP COLUMN IF EXISTS is_final_round;

-- Keep the created_at index for efficient purge queries
-- (idx_rounds_created_at was already created)