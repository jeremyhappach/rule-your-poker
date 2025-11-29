-- Add session tracking columns to games table
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS session_ended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_hands INTEGER DEFAULT 0;

-- Update existing games to set total_hands based on current_round
UPDATE public.games 
SET total_hands = COALESCE(current_round, 0)
WHERE total_hands = 0;