-- Update the position check constraint to allow positions 1-7
ALTER TABLE public.players DROP CONSTRAINT players_position_check;
ALTER TABLE public.players ADD CONSTRAINT players_position_check CHECK (position >= 1 AND position <= 7);