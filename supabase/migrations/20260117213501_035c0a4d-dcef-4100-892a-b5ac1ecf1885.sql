-- Update the default for table_layout to 'bridge' and update all existing players
ALTER TABLE public.profiles ALTER COLUMN table_layout SET DEFAULT 'bridge';

-- Update all existing players to use 'bridge' felt
UPDATE public.profiles SET table_layout = 'bridge';

-- Drop the show_bridge_on_waiting column as it's no longer needed
ALTER TABLE public.profiles DROP COLUMN IF EXISTS show_bridge_on_waiting;