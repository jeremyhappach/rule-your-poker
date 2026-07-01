
INSERT INTO public.system_settings (key, value)
VALUES ('harnesses_mode', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

UPDATE public.system_settings
SET value = '{"enabled": false}'::jsonb, updated_at = now()
WHERE key = 'debug_mode';
