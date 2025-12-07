-- Add player options columns to players table
ALTER TABLE public.players
ADD COLUMN auto_ante boolean NOT NULL DEFAULT false,
ADD COLUMN sit_out_next_hand boolean NOT NULL DEFAULT false,
ADD COLUMN stand_up_next_hand boolean NOT NULL DEFAULT false;