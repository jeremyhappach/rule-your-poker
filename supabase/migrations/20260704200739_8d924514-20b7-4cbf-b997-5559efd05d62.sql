
ALTER TABLE public.client_runtime_incidents
  ADD COLUMN IF NOT EXISTS network_lost_observed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_local_capsule_sequence integer,
  ADD COLUMN IF NOT EXISTS recovered_from_local_capsule boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_upload_completed_at timestamptz;
