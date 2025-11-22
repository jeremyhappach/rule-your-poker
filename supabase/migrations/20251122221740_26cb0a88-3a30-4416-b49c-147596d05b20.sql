-- Add decision tracking for simultaneous play
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS current_decision TEXT,
  ADD COLUMN IF NOT EXISTS decision_locked BOOLEAN DEFAULT false;

-- Add round betting amount
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS bet_amount INTEGER DEFAULT 10;

-- Update games table
ALTER TABLE public.games
  DROP COLUMN IF EXISTS current_player_position,
  DROP COLUMN IF EXISTS current_bet,
  ADD COLUMN IF NOT EXISTS all_decisions_in BOOLEAN DEFAULT false;