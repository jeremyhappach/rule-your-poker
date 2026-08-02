INSERT INTO public.system_settings (key, value) VALUES ('debug_mode', '{"enabled": false}'::jsonb) ON CONFLICT (key) DO NOTHING;
