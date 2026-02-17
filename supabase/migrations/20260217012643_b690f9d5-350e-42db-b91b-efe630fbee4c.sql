
-- Add gin-rummy-specific columns to game_defaults
ALTER TABLE public.game_defaults
  ADD COLUMN IF NOT EXISTS per_point_value integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gin_bonus integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS undercut_bonus integer NOT NULL DEFAULT 0;

-- Seed gin-rummy defaults row (if not exists)
INSERT INTO public.game_defaults (
  game_type,
  ante_amount,
  decision_timer_seconds,
  chucky_second_to_last_delay_seconds,
  chucky_last_card_delay_seconds,
  bot_fold_probability,
  bot_decision_delay_seconds,
  bot_use_hand_strength,
  pot_max_enabled,
  pot_max_value,
  chucky_cards,
  leg_value,
  legs_to_win,
  pussy_tax_enabled,
  pussy_tax_value,
  rabbit_hunt,
  reveal_at_showdown,
  points_to_win,
  skunk_enabled,
  skunk_threshold,
  double_skunk_enabled,
  double_skunk_threshold,
  per_point_value,
  gin_bonus,
  undercut_bonus
) VALUES (
  'gin-rummy',
  2,       -- ante_amount
  30,      -- decision_timer_seconds
  1.5, 3.0, 30, 2.0, true,  -- bot/chucky defaults (not used but required)
  false, 10, 4,              -- pot_max/chucky (not used)
  0, 0,                      -- leg_value/legs_to_win (not used)
  false, 0,                  -- pussy_tax (not used)
  false, false,              -- rabbit_hunt/reveal_at_showdown (not used)
  100,                       -- points_to_win
  false, 91, false, 61,     -- skunk settings (not used)
  0,                         -- per_point_value (0 = disabled)
  2,                         -- gin_bonus (extra ante amounts)
  2                          -- undercut_bonus (extra ante amounts)
)
ON CONFLICT (game_type) DO NOTHING;
