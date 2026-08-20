-- Cover registry foreign keys used by player/round deletion and exact timer
-- diagnostics.  The due and game/kind indexes remain optimized separately for
-- dispatcher admission.
CREATE INDEX IF NOT EXISTS idx_game_timer_registry_round_id
  ON private.game_timer_registry(round_id)
  WHERE round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_game_timer_registry_actor_player_id
  ON private.game_timer_registry(actor_player_id)
  WHERE actor_player_id IS NOT NULL;
