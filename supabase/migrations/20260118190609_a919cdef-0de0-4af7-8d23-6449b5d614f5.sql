-- Add make_it_take_it global setting to system_settings
INSERT INTO public.system_settings (key, value)
VALUES ('make_it_take_it', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Remove make_it_take_it from game_defaults since it's now a global setting
ALTER TABLE public.game_defaults DROP COLUMN IF EXISTS make_it_take_it;