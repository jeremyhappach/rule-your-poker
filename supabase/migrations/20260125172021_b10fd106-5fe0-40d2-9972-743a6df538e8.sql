-- Insert global timer settings
INSERT INTO public.system_settings (key, value)
VALUES 
  ('game_setup_timer_seconds', '30'::jsonb),
  ('ante_decision_timer_seconds', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;