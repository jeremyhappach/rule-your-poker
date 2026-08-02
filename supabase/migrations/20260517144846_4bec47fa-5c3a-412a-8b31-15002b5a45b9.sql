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
  _blocker_status  text;
  _blocker_active  boolean := false;
BEGIN
  SELECT * INTO _game FROM games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'suppressed', 'reason', 'game-not-found');
  END IF;

  -- Resolve whether current_game_uuid points to a TRULY active dealer_game.
  IF _game.current_game_uuid IS NOT NULL THEN
    SELECT g2.status INTO _blocker_status
      FROM games g2
      WHERE g2.id = _game.current_game_uuid
      LIMIT 1;
    IF _blocker_status IS NOT NULL
       AND _blocker_status NOT IN ('completed','session_ended','waiting','dealer_selection','game_selection','configuring')
    THEN
      _blocker_active := true;
    END IF;
  END IF;

  -- Identity guard
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

  -- Mark ONLY the timed-out dealer as sitting_out (preserve seat; no status='left').
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

  -- Find next eligible dealer clockwise
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

  -- Active players > 1 → rotate and continue
  IF _next_dealer_pos IS NOT NULL AND _active_total >= 2 THEN
    _new_deadline := now() + make_interval(secs => _setup_seconds);
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
      'real_money', _game.real_money
    );
  END IF;

  -- Active players <= 1 → transition to waiting (NEVER session_ended on timeout).
  -- Per contract: leave remaining player(s) at the waiting table. Cron handles
  -- real-money archive and stale-waiting cleanup after threshold.
  SELECT count(*) INTO _active_humans
    FROM players
    WHERE game_id = _game_id
      AND is_bot = false
      AND sitting_out = false
      AND status NOT IN ('observer', 'left');

  -- Truly empty case (no humans remaining at all, even sitting out) → caller
  -- handles 5s countdown for empty-session deletion. This is NOT triggered by
  -- a single dealer timing out — the timed-out player is sitting_out but still
  -- present, so this branch only fires if there are literally no humans left.
  IF NOT EXISTS (
    SELECT 1 FROM players
     WHERE game_id = _game_id
       AND is_bot = false
       AND status NOT IN ('observer', 'left')
  ) THEN
    -- Real money with no humans: archive (preserve record); otherwise empty for deletion.
    IF _game.real_money THEN
      UPDATE games
         SET status = 'waiting',
             config_deadline = null,
             config_complete = false,
             awaiting_next_round = false,
             last_round_result = null,
             current_game_uuid = NULL
       WHERE id = _game_id;
      RETURN jsonb_build_object('outcome', 'waiting', 'reason', 'real_money_no_humans_cron_will_archive');
    END IF;
    RETURN jsonb_build_object('outcome', 'empty_no_humans');
  END IF;

  -- Normal waiting transition: remaining humans stay at the table.
  UPDATE games
     SET status = 'waiting',
         config_deadline = null,
         config_complete = false,
         awaiting_next_round = false,
         last_round_result = null,
         current_game_uuid = NULL
   WHERE id = _game_id;

  RETURN jsonb_build_object(
    'outcome', 'waiting',
    'active_humans', _active_humans,
    'real_money', _game.real_money
  );
END;
$function$;
