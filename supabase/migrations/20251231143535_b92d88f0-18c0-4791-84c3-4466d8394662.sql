-- Insert default settings for Horses dice game
INSERT INTO public.game_defaults (
  game_type,
  ante_amount,
  decision_timer_seconds,
  bot_fold_probability,
  bot_decision_delay_seconds,
  bot_use_hand_strength,
  pot_max_enabled,
  pot_max_value,
  pussy_tax_enabled,
  pussy_tax_value,
  chucky_cards,
  chucky_second_to_last_delay_seconds,
  chucky_last_card_delay_seconds,
  leg_value,
  legs_to_win,
  rabbit_hunt,
  reveal_at_showdown,
  allow_bot_dealers
) VALUES (
  'horses',
  2,  -- ante_amount
  10, -- decision_timer_seconds
  30, -- bot_fold_probability
  2.0, -- bot_decision_delay_seconds
  false, -- bot_use_hand_strength (dice games don't use this)
  false, -- pot_max_enabled
  10, -- pot_max_value
  false, -- pussy_tax_enabled
  1, -- pussy_tax_value
  0, -- chucky_cards (not used for dice)
  0, -- chucky_second_to_last_delay_seconds (not used)
  0, -- chucky_last_card_delay_seconds (not used)
  0, -- leg_value (not used)
  0, -- legs_to_win (not used)
  false, -- rabbit_hunt
  false, -- reveal_at_showdown
  false -- allow_bot_dealers
);

-- Insert default settings for Ship Captain Crew dice game
INSERT INTO public.game_defaults (
  game_type,
  ante_amount,
  decision_timer_seconds,
  bot_fold_probability,
  bot_decision_delay_seconds,
  bot_use_hand_strength,
  pot_max_enabled,
  pot_max_value,
  pussy_tax_enabled,
  pussy_tax_value,
  chucky_cards,
  chucky_second_to_last_delay_seconds,
  chucky_last_card_delay_seconds,
  leg_value,
  legs_to_win,
  rabbit_hunt,
  reveal_at_showdown,
  allow_bot_dealers
) VALUES (
  'ship-captain-crew',
  2,  -- ante_amount
  10, -- decision_timer_seconds
  30, -- bot_fold_probability
  2.0, -- bot_decision_delay_seconds
  false, -- bot_use_hand_strength
  false, -- pot_max_enabled
  10, -- pot_max_value
  false, -- pussy_tax_enabled
  1, -- pussy_tax_value
  0, -- chucky_cards (not used for dice)
  0, -- chucky_second_to_last_delay_seconds (not used)
  0, -- chucky_last_card_delay_seconds (not used)
  0, -- leg_value (not used)
  0, -- legs_to_win (not used)
  false, -- rabbit_hunt
  false, -- reveal_at_showdown
  false -- allow_bot_dealers
);