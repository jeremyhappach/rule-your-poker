CREATE OR REPLACE FUNCTION public.handle_config_deadline_timeout(_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _blocker_status  text;
  _blocker_active  boolean := false;
BEGIN
  SELECT * INTO _game FROM games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'suppressed', 'reason', 'game-not-found');
  END IF;

  -- Determine whether current_game_uuid points to an ACTIVE dealer_game
  -- (i.e., one that should genuinely block a config-phase timeout).
  -- A stale/completed prior dealer_game must NOT suppress timeout handling.
  IF _game.current_game_uuid IS NOT NULL THEN
    SELECT g2.status INTO _blocker_status
      FROM games g2
      WHERE g2.id = _game.current_game_uuid
      LIMIT 1;
    -- Treat as active blocker only if the referenced game is still in-progress.
    -- Completed / waiting / dealer_selection / game_selection / configuring on the
    -- referenced row all indicate it is NOT an actively running dealer game.
    IF _blocker_status IS NOT NULL
       AND _blocker_status NOT IN ('completed','session_ended','waiting','dealer_selection','game_selection','configuring')
    THEN
      _blocker_active := true;
    END IF;
  END IF;

  -- Identity guard: must still be in config phase with an expired live deadline,
  -- and must NOT be blocked by a truly active dealer game.
  IF _game.status NOT IN ('dealer_selection', 'configuring', 'game_selection')
     OR _game.config_complete = true
     OR _blocker_active = true
     OR _game.config_deadline IS NULL
     OR _game.config_deadline > now()
  THEN
    RETURN jsonb_build_object(
      'outcome', 'suppressed',
      'reason', 'game-advanced-or-not-expired',
      'status', _game.status,
      'config_complete', _game.config_complete,
      'current_game_uuid', _game.current_game_uuid,
      'blocker_status', _blocker_status,
      'blocker_active', _blocker_active,
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

  SELECT COALESCE(gd.allow_bot_dealers, false) INTO _allow_bot
    FROM game_defaults gd
    WHERE gd.game_type = COALESCE(_game.game_type, 'holm-game')
    LIMIT 1;
  _allow_bot := COALESCE(_allow_bot, false);

  _setup_seconds := COALESCE(NULLIF(_game.game_setup_timer_seconds, 0), 30);
  IF _setup_seconds < 1 THEN _setup_seconds := 30; END IF;

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

  SELECT count(*) INTO _active_total
    FROM players p
    WHERE p.game_id = _game_id
      AND p.sitting_out = false
      AND p.position IS NOT NULL
      AND p.status NOT IN ('observer', 'left');

  IF _next_dealer_pos IS NOT NULL AND _active_total >= 2 THEN
    _new_deadline := now() + make_interval(secs => _setup_seconds);
    -- Clear stale current_game_uuid so a prior completed dealer_game doesn't
    -- continue to look like an "active" blocker on the next rotation.
    UPDATE games
       SET dealer_position = _next_dealer_pos,
           config_deadline = _new_deadline,
           config_complete = false,
           current_game_uuid = NULL
     WHERE id = _game_id;

    RETURN jsonb_build_object(
      'outcome', 'rotated',
      'new_dealer_position', _next_dealer_pos,
      'new_config_deadline', _new_deadline,
      'active_total', _active_total,
      'blocker_status', _blocker_status
    );
  END IF;

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
    RETURN jsonb_build_object('outcome', 'empty_no_humans');
  END IF;

  UPDATE games
     SET status = 'waiting',
         config_deadline = null,
         config_complete = false,
         awaiting_next_round = false,
         last_round_result = null,
         current_game_uuid = NULL
   WHERE id = _game_id;

  RETURN jsonb_build_object('outcome', 'waiting', 'active_humans', _active_humans);
END;
$function$;
