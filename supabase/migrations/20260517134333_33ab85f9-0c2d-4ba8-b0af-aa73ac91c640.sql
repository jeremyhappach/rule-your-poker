-- Shared authoritative handler for next-game config/dealer-selection timeout.
-- Replaces three divergent code paths (client DealerGameSetup, enforce-deadlines,
-- enforce-all-deadlines) with one atomic SQL function so all callers converge on:
--   * the same eligibility / rotation logic
--   * dynamic game_type lookup for allow_bot_dealers (no more hardcoded 'holm')
--   * fresh config_deadline written atomically with dealer_position
--   * real status 'waiting' (no phantom 'waiting_for_players' that has no UI contract)
--   * soft-removal of sitting-out / auto-fold players on transition to waiting
--   * row-level lock to prevent races between the three callers
--
-- The function returns a jsonb outcome describing what happened so callers
-- can react (e.g., show empty-session countdown, perform cascade delete).
-- Outcomes:
--   { outcome: 'suppressed', reason }                       -- guard rejected
--   { outcome: 'rotated', new_dealer_position, new_config_deadline }
--   { outcome: 'waiting' }                                  -- reverted, humans remain
--   { outcome: 'session_ended', reason }                    -- real_money / has_history & no humans
--   { outcome: 'empty_no_humans' }                          -- caller should cascade-delete
CREATE OR REPLACE FUNCTION public.handle_config_deadline_timeout(_game_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game            games%ROWTYPE;
  _dealer_id       uuid;
  _next_dealer_pos integer;
  _allow_bot       boolean := false;
  _setup_seconds   integer;
  _new_deadline    timestamptz;
  _active_total    integer;
  _active_humans   integer;
  _result_count    integer;
  _has_history     boolean;
BEGIN
  SELECT * INTO _game FROM games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'suppressed', 'reason', 'game-not-found');
  END IF;

  -- Identity guard: must still be in config phase with an expired live deadline
  IF _game.status NOT IN ('dealer_selection', 'configuring', 'game_selection')
     OR _game.config_complete = true
     OR _game.current_game_uuid IS NOT NULL
     OR _game.config_deadline IS NULL
     OR _game.config_deadline > now()
  THEN
    RETURN jsonb_build_object(
      'outcome', 'suppressed',
      'reason', 'game-advanced-or-not-expired',
      'status', _game.status,
      'config_complete', _game.config_complete,
      'current_game_uuid', _game.current_game_uuid,
      'config_deadline', _game.config_deadline
    );
  END IF;

  -- Mark current dealer as sitting out (may be null if dealer record vanished)
  SELECT id INTO _dealer_id
    FROM players
    WHERE game_id = _game_id AND position = _game.dealer_position
    LIMIT 1;

  IF _dealer_id IS NOT NULL THEN
    UPDATE players
       SET sitting_out = true, waiting = false
     WHERE id = _dealer_id;
  END IF;

  -- Dynamic allow_bot_dealers lookup (was hardcoded to 'holm' in enforce-* paths)
  SELECT COALESCE(gd.allow_bot_dealers, false) INTO _allow_bot
    FROM game_defaults gd
    WHERE gd.game_type = COALESCE(_game.game_type, 'holm-game')
    LIMIT 1;
  _allow_bot := COALESCE(_allow_bot, false);

  _setup_seconds := COALESCE(NULLIF(_game.game_setup_timer_seconds, 0), 30);
  IF _setup_seconds < 1 THEN _setup_seconds := 30; END IF;

  -- Pick next eligible dealer clockwise from current dealer_position
  SELECT p.position INTO _next_dealer_pos
    FROM players p
    WHERE p.game_id = _game_id
      AND p.sitting_out = false
      AND p.position IS NOT NULL
      AND p.status NOT IN ('observer', 'left')
      AND (_allow_bot OR p.is_bot = false)
      AND (_dealer_id IS NULL OR p.id <> _dealer_id)
    ORDER BY
      CASE WHEN p.position > COALESCE(_game.dealer_position, 0) THEN 0 ELSE 1 END,
      p.position
    LIMIT 1;

  -- Count remaining active seated players (humans + bots, not sitting out)
  SELECT count(*) INTO _active_total
    FROM players p
    WHERE p.game_id = _game_id
      AND p.sitting_out = false
      AND p.position IS NOT NULL
      AND p.status NOT IN ('observer', 'left');

  IF _next_dealer_pos IS NOT NULL AND _active_total >= 2 THEN
    _new_deadline := now() + make_interval(secs => _setup_seconds);
    -- Atomic rotation: dealer_position + fresh config_deadline in one update
    UPDATE games
       SET dealer_position = _next_dealer_pos,
           config_deadline = _new_deadline,
           config_complete = false
     WHERE id = _game_id;

    RETURN jsonb_build_object(
      'outcome', 'rotated',
      'new_dealer_position', _next_dealer_pos,
      'new_config_deadline', _new_deadline
    );
  END IF;

  -- Cannot continue. Determine end-state.
  IF _game.real_money THEN
    UPDATE games
       SET status = 'session_ended',
           pending_session_end = false,
           session_ended_at = now(),
           game_over_at = now(),
           config_deadline = null,
           ante_decision_deadline = null,
           awaiting_next_round = false,
           config_complete = false
     WHERE id = _game_id;
    RETURN jsonb_build_object('outcome', 'session_ended', 'reason', 'real_money_archive');
  END IF;

  SELECT count(*) INTO _result_count FROM game_results WHERE game_id = _game_id;
  _has_history := COALESCE(_game.total_hands, 0) > 0 OR _result_count > 0;

  -- Soft-remove sitting-out / auto-fold players before transitioning to waiting.
  -- (Matches Path A behavior in DealerGameSetup so observers see a clean roster.)
  UPDATE players
     SET status = 'left', sitting_out = true
   WHERE game_id = _game_id
     AND status <> 'left'
     AND (sitting_out = true OR auto_fold = true);

  SELECT count(*) INTO _active_humans
    FROM players
    WHERE game_id = _game_id
      AND is_bot = false
      AND status NOT IN ('observer', 'left');

  IF _active_humans < 1 THEN
    IF _has_history THEN
      UPDATE games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = now(),
             game_over_at = now(),
             config_deadline = null,
             ante_decision_deadline = null,
             awaiting_next_round = false,
             config_complete = false
       WHERE id = _game_id;
      RETURN jsonb_build_object('outcome', 'session_ended', 'reason', 'history_no_humans');
    END IF;
    -- Empty session: caller handles cascade delete (client wants a UI countdown first)
    RETURN jsonb_build_object('outcome', 'empty_no_humans');
  END IF;

  -- Humans remain but can't continue this game → revert to waiting (real status, not phantom)
  UPDATE games
     SET status = 'waiting',
         config_deadline = null,
         config_complete = false,
         awaiting_next_round = false,
         last_round_result = null
   WHERE id = _game_id;

  RETURN jsonb_build_object('outcome', 'waiting');
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_config_deadline_timeout(uuid) TO anon, authenticated, service_role;
