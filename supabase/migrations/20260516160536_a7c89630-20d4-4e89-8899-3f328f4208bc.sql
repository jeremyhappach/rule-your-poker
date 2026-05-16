-- 1. game_defaults: add config-backed timeout policy fields
ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS timeout_enforcement_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timeout_action text NOT NULL DEFAULT 'none';

-- Constrain to the allowed action set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_defaults_timeout_action_chk'
  ) THEN
    ALTER TABLE public.game_defaults
      ADD CONSTRAINT game_defaults_timeout_action_chk
      CHECK (timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll'));
  END IF;
END$$;

-- 2. games: session-level overrides (nullable = inherit from defaults)
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS timeout_enforcement_enabled boolean,
  ADD COLUMN IF NOT EXISTS timeout_action text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'games_timeout_action_chk'
  ) THEN
    ALTER TABLE public.games
      ADD CONSTRAINT games_timeout_action_chk
      CHECK (timeout_action IS NULL OR timeout_action IN ('none','auto_fold','auto_sit_out','auto_roll'));
  END IF;
END$$;

-- 3. Seed authoritative ruleset policy per existing game type
UPDATE public.game_defaults
SET timeout_enforcement_enabled = true, timeout_action = 'auto_fold'
WHERE game_type IN ('holm','holm-game','3-5-7','3-5-7-game','357');

UPDATE public.game_defaults
SET timeout_enforcement_enabled = true, timeout_action = 'auto_roll'
WHERE game_type IN ('horses','ship-captain-crew');

UPDATE public.game_defaults
SET timeout_enforcement_enabled = false, timeout_action = 'none'
WHERE game_type IN ('yahtzee','gin-rummy','cribbage');
