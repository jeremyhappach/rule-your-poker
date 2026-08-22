-- Presentation cadence only. PostgreSQL remains the owner of settlement,
-- balances, transfer cursors, round continuation, and terminal disposition.
ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS three_five_seven_showdown_delay_ms integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS holm_rabbit_hunt_post_reveal_delay_ms integer NOT NULL DEFAULT 1000;

ALTER TABLE public.game_defaults
  DROP CONSTRAINT IF EXISTS game_defaults_three_five_seven_showdown_delay_ms_range,
  DROP CONSTRAINT IF EXISTS game_defaults_holm_rabbit_hunt_post_reveal_delay_ms_range;

ALTER TABLE public.game_defaults
  ADD CONSTRAINT game_defaults_three_five_seven_showdown_delay_ms_range
    CHECK (three_five_seven_showdown_delay_ms BETWEEN 0 AND 10000),
  ADD CONSTRAINT game_defaults_holm_rabbit_hunt_post_reveal_delay_ms_range
    CHECK (holm_rabbit_hunt_post_reveal_delay_ms BETWEEN 0 AND 10000);

COMMENT ON COLUMN public.game_defaults.three_five_seven_showdown_delay_ms IS
  'Presentation-only reading dwell after an enabled 3-5-7 secret reveal paints.';
COMMENT ON COLUMN public.game_defaults.holm_rabbit_hunt_post_reveal_delay_ms IS
  'Presentation-only dwell after Rabbit Hunt card 4 lands and before client continuation acknowledgement.';
