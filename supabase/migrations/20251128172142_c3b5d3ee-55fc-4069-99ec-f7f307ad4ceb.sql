-- Add sitting out and ante decision tracking
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS sitting_out boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS ante_decision text DEFAULT NULL;

-- Add ante decision phase tracking
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS ante_decision_deadline timestamp with time zone DEFAULT NULL;