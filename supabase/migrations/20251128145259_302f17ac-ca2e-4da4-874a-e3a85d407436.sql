-- Add fields to pause between rounds for testing
ALTER TABLE public.games 
ADD COLUMN awaiting_next_round boolean DEFAULT false,
ADD COLUMN next_round_number integer;