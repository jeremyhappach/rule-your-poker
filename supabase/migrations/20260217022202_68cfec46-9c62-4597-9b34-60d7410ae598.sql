-- Add 'left' as a valid player status
ALTER TABLE public.players DROP CONSTRAINT players_status_check;
ALTER TABLE public.players ADD CONSTRAINT players_status_check CHECK (status = ANY (ARRAY['active', 'folded', 'eliminated', 'left']));