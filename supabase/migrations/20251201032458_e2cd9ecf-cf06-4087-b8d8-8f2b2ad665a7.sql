-- Remove the round_number constraint to allow unlimited rounds in Holm game
ALTER TABLE public.rounds DROP CONSTRAINT rounds_round_number_check;