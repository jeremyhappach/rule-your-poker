-- Add allow_bot_dealers column to game_defaults table
ALTER TABLE public.game_defaults 
ADD COLUMN allow_bot_dealers boolean NOT NULL DEFAULT false;

-- Update existing rows to have the setting enabled (since we just implemented bot dealers)
UPDATE public.game_defaults SET allow_bot_dealers = true;