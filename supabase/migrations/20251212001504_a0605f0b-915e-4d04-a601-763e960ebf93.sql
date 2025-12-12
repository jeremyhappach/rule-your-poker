-- Remove the CHECK constraint on current_round that limits it to 0-3
-- This constraint was for 3-5-7 games but Holm games need unlimited round numbers

-- First, drop the existing constraint
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_current_round_check;

-- Add a new constraint that only requires non-negative values (no upper limit)
ALTER TABLE public.games ADD CONSTRAINT games_current_round_check CHECK (current_round >= 0);