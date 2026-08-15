-- One production-release record is emitted after Vercel has promoted a
-- deployment to the public alias. It contains no user or gameplay data.
-- Realtime publication and public read access already belong to the existing
-- system_settings contract; only the verified Edge Function may update it.

INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'release_publication',
  '{"schemaVersion":1}'::jsonb,
  to_timestamp(0)
)
ON CONFLICT (key) DO NOTHING;
