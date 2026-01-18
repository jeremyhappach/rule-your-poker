-- Add make_it_take_it setting to game_defaults table
-- When true, the winner of a game becomes the next dealer (if active)
ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS make_it_take_it boolean NOT NULL DEFAULT false;

-- Update existing rows to default value
UPDATE public.game_defaults SET make_it_take_it = false WHERE make_it_take_it IS NULL;