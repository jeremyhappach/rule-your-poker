-- Holm presentation timing is configuration, not gameplay authority. These
-- values govern the client-side visual admission gates and the matching
-- availability pauses in the legacy showdown coordinator.
ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS holm_after_tabled_delay_ms integer NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS holm_pre_chucky_delay_ms integer NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS holm_multi_showdown_delay_ms integer NOT NULL DEFAULT 2000;

ALTER TABLE public.game_defaults
  DROP CONSTRAINT IF EXISTS game_defaults_holm_after_tabled_delay_ms_range,
  DROP CONSTRAINT IF EXISTS game_defaults_holm_pre_chucky_delay_ms_range,
  DROP CONSTRAINT IF EXISTS game_defaults_holm_multi_showdown_delay_ms_range;

ALTER TABLE public.game_defaults
  ADD CONSTRAINT game_defaults_holm_after_tabled_delay_ms_range
    CHECK (holm_after_tabled_delay_ms BETWEEN 0 AND 10000),
  ADD CONSTRAINT game_defaults_holm_pre_chucky_delay_ms_range
    CHECK (holm_pre_chucky_delay_ms BETWEEN 0 AND 10000),
  ADD CONSTRAINT game_defaults_holm_multi_showdown_delay_ms_range
    CHECK (holm_multi_showdown_delay_ms BETWEEN 0 AND 10000);
