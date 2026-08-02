-- Add a persistent first-hand flag for Holm games
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS is_first_hand boolean NOT NULL DEFAULT false;

-- Backfill existing rows safely (column default already false)
UPDATE public.games
SET is_first_hand = false
WHERE is_first_hand IS DISTINCT FROM false;
