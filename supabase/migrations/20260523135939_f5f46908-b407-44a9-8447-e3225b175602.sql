ALTER TABLE public.game_defaults ADD COLUMN IF NOT EXISTS debug_harness text NOT NULL DEFAULT 'none';
