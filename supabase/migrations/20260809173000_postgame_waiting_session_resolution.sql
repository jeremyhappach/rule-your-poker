-- Session abandonment applies only after a settled dealer game has returned
-- to the post-game waiting table. It must never evict an absent player while
-- a dealer game, setup, or ante decision is live.

CREATE OR REPLACE FUNCTION private.finalize_settled_session_if_no_active_humans(
  p_game_id uuid,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_active_humans integer := 0;
  v_result_count integer := 0;
  v_snapshot_count integer := 0;
  v_missing_or_stale_snapshot boolean := false;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  IF NOT COALESCE(v_game.real_money, false) THEN
    RETURN 'ineligible-state';
  END IF;

  IF v_game.status = 'session_ended' THEN
    RETURN 'already-session-ended';
  END IF;

  SELECT count(*) INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans > 0 THEN
    RETURN 'active-humans';
  END IF;

  SELECT count(*) INTO v_result_count
    FROM public.game_results
   WHERE game_id = p_game_id;

  IF v_result_count = 0 THEN
    RETURN 'no-settled-results';
  END IF;

  SELECT count(DISTINCT user_id) INTO v_snapshot_count
    FROM public.session_player_snapshots
   WHERE game_id = p_game_id
     AND is_bot = false;

  SELECT EXISTS (
    SELECT 1
      FROM public.players AS player
     WHERE player.game_id = p_game_id
       AND player.is_bot = false
       AND player.status <> 'observer'
       AND NOT EXISTS (
         SELECT 1
           FROM (
             SELECT DISTINCT ON (snapshot.user_id)
                    snapshot.user_id,
                    snapshot.chips
               FROM public.session_player_snapshots AS snapshot
              WHERE snapshot.game_id = p_game_id
                AND snapshot.is_bot = false
              ORDER BY snapshot.user_id, snapshot.created_at DESC, snapshot.id DESC
           ) AS latest
          WHERE latest.user_id = player.user_id
            AND latest.chips = player.chips
       )
  ) INTO v_missing_or_stale_snapshot;

  IF v_snapshot_count = 0 OR v_missing_or_stale_snapshot THEN
    RETURN 'blocked-incomplete-final-snapshots';
  END IF;

  -- The existing games-status trigger mints SessionResult rows from the
  -- already-final snapshots. Its unique key keeps a repeated call idempotent.
  UPDATE public.games
     SET status = 'session_ended',
         pending_session_end = false,
         session_ended_at = p_now,
         game_over_at = COALESCE(game_over_at, p_now),
         is_paused = false
   WHERE id = p_game_id
     AND status <> 'session_ended';

  DELETE FROM private.session_abandonment_watches
   WHERE game_id = p_game_id;

  RETURN 'session-ended-with-results';
END;
$function$;

CREATE OR REPLACE FUNCTION private.resolve_postgame_participation(
  p_game_id uuid,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_active_humans integer := 0;
  v_outcome text;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  IF NOT COALESCE(v_game.real_money, false)
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN 'ineligible-state';
  END IF;

  SELECT count(*) INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans = 0 THEN
    v_outcome := private.finalize_settled_session_if_no_active_humans(p_game_id, p_now);
    IF v_outcome <> 'no-settled-results' THEN
      RETURN v_outcome;
    END IF;

    -- A never-settled room has no balances to rectify. Keep it in waiting so
    -- the existing explicit-leave/empty-room lifecycle can dispose of it;
    -- never manufacture a SessionResult for it.
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;
    RETURN 'waiting-no-settled-results';
  END IF;

  -- One active human cannot start another dealer game, but a still-seated
  -- disconnected player remains active until the post-game presence lease
  -- expires. That lease begins only after this transition commits.
  UPDATE public.games
     SET status = 'waiting',
         current_game_uuid = NULL,
         config_complete = false,
         config_deadline = NULL,
         ante_decision_deadline = NULL,
         awaiting_next_round = false,
         last_round_result = NULL
   WHERE id = p_game_id;

  RETURN 'waiting-active-humans:' || v_active_humans::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_postgame_participation(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_outcome text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.players AS player
     WHERE player.game_id = p_game_id
       AND player.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('outcome', 'not-authorized');
  END IF;

  v_outcome := private.resolve_postgame_participation(
    p_game_id,
    clock_timestamp()
  );

  RETURN jsonb_build_object('outcome', v_outcome);
END;
$function$;

REVOKE ALL ON FUNCTION private.finalize_settled_session_if_no_active_humans(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_postgame_participation(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_postgame_participation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_postgame_participation(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION private.reconcile_session_abandonment(
  p_game_id uuid,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_watch private.session_abandonment_watches%ROWTYPE;
  v_active_humans integer := 0;
  v_outcome text;
BEGIN
  IF p_game_id IS NULL THEN
    RETURN 'missing-game-id';
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  -- Presence reconciliation is legal only at a settled post-game waiting
  -- boundary. Initial waiting rooms and every live dealer-game state are out.
  IF NOT COALESCE(v_game.real_money, false)
     OR v_game.status NOT IN ('waiting', 'waiting_for_players')
     OR v_game.current_game_uuid IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.game_results WHERE game_id = p_game_id
     ) THEN
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    RETURN 'ineligible-state';
  END IF;

  SELECT * INTO v_watch
    FROM private.session_abandonment_watches
   WHERE game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'unarmed';
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  -- A heartbeat before post-game waiting does not keep a player active here.
  -- The 15-second lease starts at armed_at and resets only on a heartbeat
  -- received after that exact boundary.
  UPDATE public.players AS player
     SET sitting_out = true,
         waiting = false
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left')
     AND p_now >= v_watch.armed_at + interval '15 seconds'
     AND NOT EXISTS (
       SELECT 1
         FROM public.voice_presence_heartbeats AS heartbeat
        WHERE heartbeat.game_id = p_game_id
          AND heartbeat.user_id = player.user_id
          AND heartbeat.status IN ('active', 'hidden')
          AND heartbeat.updated_at >= GREATEST(
            v_watch.armed_at,
            p_now - interval '15 seconds'
          )
     );

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  SELECT count(*) INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans > 0 THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = NULL,
           last_checked_at = p_now,
           next_check_at = p_now + interval '30 seconds',
           last_outcome = 'active-humans:' || v_active_humans::text,
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'active-humans';
  END IF;

  v_outcome := private.finalize_settled_session_if_no_active_humans(
    p_game_id,
    p_now
  );
  RETURN v_outcome;
END;
$function$;

CREATE OR REPLACE FUNCTION private.on_game_abandonment_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF COALESCE(NEW.real_money, false)
     AND NEW.status IN ('waiting', 'waiting_for_players')
     AND NEW.current_game_uuid IS NULL
     AND EXISTS (
       SELECT 1 FROM public.game_results WHERE game_id = NEW.id
     ) THEN
    INSERT INTO private.session_abandonment_watches (
      game_id, armed_at, zero_active_since, next_check_at,
      last_outcome, updated_at
    ) VALUES (
      NEW.id, v_now, NULL, v_now,
      'armed-at-postgame-waiting', v_now
    )
    ON CONFLICT (game_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          zero_active_since = NULL,
          next_check_at = EXCLUDED.next_check_at,
          last_outcome = EXCLUDED.last_outcome,
          updated_at = EXCLUDED.updated_at;

    PERFORM private.reconcile_session_abandonment(NEW.id, v_now);
  ELSE
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.on_player_abandonment_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game_id uuid := NEW.game_id;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF current_setting('ptown.session_presence_reconcile', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.games AS game
     WHERE game.id = v_game_id
       AND game.real_money = true
       AND game.status IN ('waiting', 'waiting_for_players')
       AND game.current_game_uuid IS NULL
       AND EXISTS (
         SELECT 1 FROM public.game_results WHERE game_id = game.id
       )
  ) THEN
    INSERT INTO private.session_abandonment_watches (
      game_id, armed_at, next_check_at, last_outcome, updated_at
    ) VALUES (
      v_game_id, v_now, v_now, 'armed-by-postgame-player-signal', v_now
    )
    ON CONFLICT (game_id) DO UPDATE
      SET next_check_at = EXCLUDED.next_check_at,
          last_outcome = EXCLUDED.last_outcome,
          updated_at = EXCLUDED.updated_at;

    PERFORM private.reconcile_session_abandonment(v_game_id, v_now);
  END IF;

  RETURN NEW;
END;
$function$;

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
  _outcome         text;
BEGIN
  SELECT * INTO _game FROM games WHERE id = _game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'suppressed', 'reason', 'game-not-found');
  END IF;

  IF _game.current_game_uuid IS NOT NULL THEN
    SELECT g2.status INTO _blocker_status FROM games g2
     WHERE g2.id = _game.current_game_uuid LIMIT 1;
    IF _blocker_status IS NOT NULL
       AND _blocker_status NOT IN ('completed','session_ended','waiting','dealer_selection','game_selection','configuring')
    THEN
      _blocker_active := true;
    END IF;
  END IF;

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

  SELECT id INTO _dealer_id FROM players
   WHERE game_id = _game_id AND position = _game.dealer_position LIMIT 1;
  IF _dealer_id IS NOT NULL THEN
    UPDATE players SET sitting_out = true, waiting = false WHERE id = _dealer_id;
  END IF;

  SELECT COALESCE(gd.allow_bot_dealers, false) INTO _allow_bot
    FROM game_defaults gd
   WHERE gd.game_type = COALESCE(_game.game_type, 'holm-game') LIMIT 1;
  _allow_bot := COALESCE(_allow_bot, false);
  _setup_seconds := COALESCE(NULLIF(_game.game_setup_timer_seconds, 0), 30);
  IF _setup_seconds < 1 THEN _setup_seconds := 30; END IF;

  SELECT count(*) INTO _active_total FROM players p
   WHERE p.game_id = _game_id AND p.sitting_out = false
     AND p.position IS NOT NULL AND p.status NOT IN ('observer', 'left');
  SELECT count(*) INTO _active_humans FROM players p
   WHERE p.game_id = _game_id AND p.is_bot = false
     AND p.sitting_out = false AND p.status NOT IN ('observer', 'left');

  IF _active_humans = 0 THEN
    _outcome := private.resolve_postgame_participation(_game_id, clock_timestamp());
    RETURN jsonb_build_object('outcome', CASE
      WHEN _outcome = 'session-ended-with-results' THEN 'session_ended'
      ELSE 'waiting'
    END, 'reason', _outcome);
  END IF;

  SELECT p.position INTO _next_dealer_pos FROM players p
   WHERE p.game_id = _game_id AND p.sitting_out = false
     AND p.position IS NOT NULL AND p.status NOT IN ('observer', 'left')
     AND (_allow_bot OR p.is_bot = false)
     AND (_dealer_id IS NULL OR p.id <> _dealer_id)
   ORDER BY CASE WHEN p.position > COALESCE(_game.dealer_position, 0) THEN 0 ELSE 1 END,
            p.position
   LIMIT 1;

  IF _next_dealer_pos IS NOT NULL AND _active_total >= 2 THEN
    _new_deadline := now() + make_interval(secs => _setup_seconds);
    UPDATE games SET dealer_position = _next_dealer_pos,
                     config_deadline = _new_deadline,
                     config_complete = false,
                     current_game_uuid = NULL
     WHERE id = _game_id;
    RETURN jsonb_build_object('outcome', 'rotated',
      'new_dealer_position', _next_dealer_pos,
      'new_config_deadline', _new_deadline,
      'active_total', _active_total,
      'real_money', _game.real_money);
  END IF;

  UPDATE games SET status = 'waiting', config_deadline = null,
                   config_complete = false, awaiting_next_round = false,
                   last_round_result = null, current_game_uuid = NULL
   WHERE id = _game_id;
  RETURN jsonb_build_object('outcome', 'waiting',
    'active_humans', _active_humans, 'real_money', _game.real_money);
END;
$function$;
