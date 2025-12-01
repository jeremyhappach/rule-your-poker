-- Add current_turn_position to rounds table to track whose turn it is
-- separate from buck_position which only rotates between rounds
ALTER TABLE public.rounds ADD COLUMN current_turn_position INTEGER;