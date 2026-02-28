
-- Add yahtzee_state JSONB column to rounds table (mirrors cribbage_state, gin_rummy_state, horses_state)
ALTER TABLE public.rounds ADD COLUMN IF NOT EXISTS yahtzee_state jsonb DEFAULT NULL;

-- Insert game_defaults row for yahtzee
INSERT INTO public.game_defaults (game_type, ante_amount, decision_timer_seconds, bot_decision_delay_seconds)
VALUES ('yahtzee', 2, 30, 2.0)
ON CONFLICT (game_type) DO NOTHING;
