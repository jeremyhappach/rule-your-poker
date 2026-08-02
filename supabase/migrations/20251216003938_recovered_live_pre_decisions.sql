-- Add pre-decision columns to players table
ALTER TABLE public.players 
ADD COLUMN pre_fold boolean DEFAULT false,
ADD COLUMN pre_stay boolean DEFAULT false;
