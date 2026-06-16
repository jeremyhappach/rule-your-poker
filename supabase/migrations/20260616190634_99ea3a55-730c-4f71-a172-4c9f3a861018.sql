INSERT INTO public.system_settings (key, value)
VALUES ('canonical_shell_layout', '{"playSafeTop": 24, "playSafeBottom": 12}'::jsonb)
ON CONFLICT (key) DO NOTHING;