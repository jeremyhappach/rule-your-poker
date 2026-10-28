-- Local smoke candidate only. Production application remains explicitly on hold.
-- battle31_configure already copies this canonical default into immutable match rules.
-- No active dealer_games, matches, admission gates or financial state are changed.
DO $$ BEGIN
 UPDATE public.game_defaults SET decision_timer_seconds=30 WHERE game_type='battle-31';
 IF NOT FOUND THEN RAISE EXCEPTION 'battle31:missing_game_defaults'; END IF;
END $$;
