-- Waiting-table presence is phase-specific and seat-based.
--
-- Initial Waiting:
--   * ready humans are stood up after 300 seconds without a heartbeat;
--   * zero seated humans deletes only a proven-pristine session.
-- Subsequent Waiting:
--   * timer-forced sitters are stood up after 15 seconds;
--   * voluntary sitters are stood up after 60 seconds;
--   * active humans are demoted after 60 seconds and stood up 15 seconds later;
--   * zero seated humans, rather than zero active humans, ends the session.

ALTER TABLE private.session_abandonment_watches
  ADD COLUMN IF NOT EXISTS waiting_kind text;

UPDATE private.session_abandonment_watches
   SET waiting_kind = 'subsequent'
 WHERE waiting_kind IS NULL;

ALTER TABLE private.session_abandonment_watches
  ALTER COLUMN waiting_kind SET DEFAULT 'subsequent',
  ALTER COLUMN waiting_kind SET NOT NULL;

ALTER TABLE private.session_abandonment_watches
  DROP CONSTRAINT IF EXISTS session_abandonment_watches_waiting_kind_check;
ALTER TABLE private.session_abandonment_watches
  ADD CONSTRAINT session_abandonment_watches_waiting_kind_check
  CHECK (waiting_kind IN ('initial', 'subsequent'));

ALTER TABLE private.postgame_forced_absence_watches
  DROP CONSTRAINT IF EXISTS postgame_forced_absence_watches_reason_check;
ALTER TABLE private.postgame_forced_absence_watches
  ADD CONSTRAINT postgame_forced_absence_watches_reason_check
  CHECK (reason IN ('config_timeout', 'ante_timeout', 'presence_timeout'));

INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'postgame_presence',
  jsonb_build_object(
    'subsequent_active_grace_seconds', 60,
    'subsequent_sitting_out_grace_seconds', 60,
    'forced_absence_confirmation_seconds', 15,
    'initial_waiting_grace_seconds', 300
  ),
  clock_timestamp()
)
ON CONFLICT (key) DO UPDATE
  SET value = COALESCE(public.system_settings.value, '{}'::jsonb) || EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;

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
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_results boolean := false;
  v_has_unsettled_financial_evidence boolean := false;
  v_outcome text;
BEGIN
  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  IF v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN 'ineligible-state';
  END IF;

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_results;

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_results THEN
      RETURN private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        p_now
      );
    END IF;

    IF COALESCE(v_game.real_money, false) AND NOT v_has_results THEN
      SELECT
        EXISTS (
          SELECT 1 FROM public.session_player_snapshots
           WHERE game_id = p_game_id
        )
        OR EXISTS (
          SELECT 1 FROM public.player_transactions
           WHERE source_game_id = p_game_id
        )
        OR COALESCE(v_game.pot, 0) <> 0
        OR EXISTS (
          SELECT 1 FROM public.players
           WHERE game_id = p_game_id AND chips <> 0
        )
        INTO v_has_unsettled_financial_evidence;

      IF v_has_unsettled_financial_evidence THEN
        UPDATE public.games
           SET status = 'waiting',
               current_game_uuid = NULL,
               config_complete = false,
               config_deadline = NULL,
               ante_decision_deadline = NULL,
               awaiting_next_round = false,
               last_round_result = NULL
         WHERE id = p_game_id;
        RETURN 'blocked-unsettled-financial-evidence';
      END IF;
    END IF;

    UPDATE public.games
       SET status = 'session_ended',
           pending_session_end = false,
           session_ended_at = p_now,
           game_over_at = COALESCE(game_over_at, p_now),
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL,
           is_paused = false
     WHERE id = p_game_id
       AND status <> 'session_ended';

    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    DELETE FROM private.postgame_forced_absence_watches
     WHERE game_id = p_game_id;

    RETURN 'session-ended-without-financial-settlement';
  END IF;

  UPDATE public.games
     SET status = 'waiting',
         current_game_uuid = NULL,
         config_complete = false,
         config_deadline = NULL,
         ante_decision_deadline = NULL,
         awaiting_next_round = false,
         last_round_result = NULL
   WHERE id = p_game_id;

  RETURN 'waiting-seated-humans:' || v_seated_humans::text ||
    ';active-humans:' || v_active_humans::text ||
    ';active-players:' || v_active_players::text;
END;
$function$;

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
  v_seated_humans integer := 0;
  v_missed_heartbeat_counts jsonb := '{}'::jsonb;
  v_active_grace_seconds integer := 60;
  v_sitting_out_grace_seconds integer := 60;
  v_forced_confirmation_seconds integer := 15;
  v_initial_grace_seconds integer := 300;
  v_nonpristine boolean := false;
  v_outcome text;
  v_deleted integer := 0;
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

  IF v_game.status NOT IN ('waiting', 'waiting_for_players')
     OR v_game.current_game_uuid IS NOT NULL THEN
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    IF v_game.status = 'session_ended' THEN
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;
    END IF;
    RETURN 'ineligible-state';
  END IF;

  SELECT * INTO v_watch
    FROM private.session_abandonment_watches
   WHERE game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'unarmed';
  END IF;

  SELECT
    CASE
      WHEN setting.value ->> 'subsequent_active_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_active_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'subsequent_sitting_out_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(3600, GREATEST(15,
          (setting.value ->> 'subsequent_sitting_out_grace_seconds')::integer))
      ELSE 60
    END,
    CASE
      WHEN setting.value ->> 'forced_absence_confirmation_seconds' ~ '^[0-9]+$'
        THEN LEAST(300, GREATEST(5,
          (setting.value ->> 'forced_absence_confirmation_seconds')::integer))
      ELSE 15
    END,
    CASE
      WHEN setting.value ->> 'initial_waiting_grace_seconds' ~ '^[0-9]+$'
        THEN LEAST(7200, GREATEST(60,
          (setting.value ->> 'initial_waiting_grace_seconds')::integer))
      ELSE 300
    END
    INTO v_active_grace_seconds, v_sitting_out_grace_seconds,
         v_forced_confirmation_seconds, v_initial_grace_seconds
    FROM public.system_settings AS setting
   WHERE setting.key = 'postgame_presence'
   LIMIT 1;

  v_active_grace_seconds := COALESCE(v_active_grace_seconds, 60);
  v_sitting_out_grace_seconds := COALESCE(v_sitting_out_grace_seconds, 60);
  v_forced_confirmation_seconds := COALESCE(v_forced_confirmation_seconds, 15);
  v_initial_grace_seconds := COALESCE(v_initial_grace_seconds, 300);

  SELECT COALESCE(
    jsonb_object_agg(
      player.id::text,
      GREATEST(
        0,
        floor(EXTRACT(EPOCH FROM (
          p_now - GREATEST(
            v_watch.armed_at,
            player.created_at,
            COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
          )
        )) / 5)::integer
      )
    ),
    '{}'::jsonb
  ) INTO v_missed_heartbeat_counts
    FROM public.players AS player
    LEFT JOIN LATERAL (
      SELECT heartbeat.updated_at
        FROM public.voice_presence_heartbeats AS heartbeat
       WHERE heartbeat.game_id = p_game_id
         AND heartbeat.user_id = player.user_id
         AND heartbeat.status IN ('active', 'hidden')
         AND heartbeat.updated_at >= v_watch.armed_at
       ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
       LIMIT 1
    ) AS latest_heartbeat ON true
   WHERE player.game_id = p_game_id
     AND NOT player.is_bot
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer', 'left');

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- Any heartbeat after a forced claim cancels stand-up, but Sitting Out is
  -- retained. The player opts back in through the ordinary table action.
  DELETE FROM private.postgame_forced_absence_watches AS forced
   WHERE forced.game_id = p_game_id
     AND (
       NOT EXISTS (
         SELECT 1
           FROM public.players AS player
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND NOT player.is_bot
            AND player.position IS NOT NULL
            AND player.sitting_out
            AND player.status NOT IN ('observer', 'left')
       )
       OR EXISTS (
         SELECT 1
           FROM public.players AS player
           JOIN public.voice_presence_heartbeats AS heartbeat
             ON heartbeat.user_id = player.user_id
            AND heartbeat.game_id = player.game_id
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       )
     );

  IF v_watch.waiting_kind = 'subsequent' THEN
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM private.postgame_forced_absence_watches AS forced
     WHERE forced.game_id = p_game_id
       AND forced.player_id = player.id
       AND player.game_id = forced.game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND p_now >= forced.armed_at
         + make_interval(secs => v_forced_confirmation_seconds)
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = forced.game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= forced.armed_at
       );

    DELETE FROM private.postgame_forced_absence_watches AS forced
     USING public.players AS player
     WHERE forced.game_id = p_game_id
       AND player.id = forced.player_id
       AND player.game_id = forced.game_id
       AND (
         player.status IN ('observer', 'left')
         OR NOT player.sitting_out
       );

    -- A sitting-out human without a forced claim is voluntary (or recovered
    -- from one). Sixty seconds without any new heartbeat releases the seat.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND NOT EXISTS (
           SELECT 1
             FROM private.postgame_forced_absence_watches AS forced
            WHERE forced.game_id = player.game_id
              AND forced.player_id = player.id
         )
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_sitting_out_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    -- The lateral join above intentionally requires a post-boundary heartbeat.
    -- Handle never-seen voluntary sitters from the boundary timestamp.
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.sitting_out
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM private.postgame_forced_absence_watches AS forced
          WHERE forced.game_id = player.game_id
            AND forced.player_id = player.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_sitting_out_grace_seconds);

    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        LEFT JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND NOT player.sitting_out
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
         ) + make_interval(secs => v_active_grace_seconds)
    ), demoted AS (
      UPDATE public.players AS player
         SET sitting_out = true,
             waiting = false
        FROM due
       WHERE player.id = due.id
       RETURNING player.game_id, player.id
    )
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT demoted.game_id, demoted.id, p_now, 'presence_timeout'
      FROM demoted
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  ELSE
    -- Initial Waiting has no Sit Out action. Ready humans are stood up after
    -- five minutes without a heartbeat and no intermediate demotion.
    WITH due AS (
      SELECT player.id
        FROM public.players AS player
        JOIN LATERAL (
          SELECT heartbeat.updated_at
            FROM public.voice_presence_heartbeats AS heartbeat
           WHERE heartbeat.game_id = p_game_id
             AND heartbeat.user_id = player.user_id
             AND heartbeat.status IN ('active', 'hidden')
             AND heartbeat.updated_at >= v_watch.armed_at
           ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
           LIMIT 1
        ) AS latest_heartbeat ON true
       WHERE player.game_id = p_game_id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.status NOT IN ('observer', 'left')
         AND p_now >= GREATEST(
           v_watch.armed_at,
           player.created_at,
           latest_heartbeat.updated_at
         ) + make_interval(secs => v_initial_grace_seconds)
    )
    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
      FROM due
     WHERE player.id = due.id;

    UPDATE public.players AS player
       SET status = 'left',
           sitting_out = true,
           stand_up_next_hand = false,
           sit_out_next_hand = false,
           ante_decision = NULL,
           auto_ante = false,
           auto_ante_runback = false,
           auto_fold = false,
           waiting = false
     WHERE player.game_id = p_game_id
       AND NOT player.is_bot
       AND player.position IS NOT NULL
       AND player.status NOT IN ('observer', 'left')
       AND NOT EXISTS (
         SELECT 1
           FROM public.voice_presence_heartbeats AS heartbeat
          WHERE heartbeat.game_id = p_game_id
            AND heartbeat.user_id = player.user_id
            AND heartbeat.status IN ('active', 'hidden')
            AND heartbeat.updated_at >= v_watch.armed_at
       )
       AND p_now >= GREATEST(v_watch.armed_at, player.created_at)
         + make_interval(secs => v_initial_grace_seconds);
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_seated_humans > 0 THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = CASE
             WHEN v_active_humans = 0
               THEN COALESCE(zero_active_since, p_now)
             ELSE NULL
           END,
           last_checked_at = p_now,
           next_check_at = p_now + interval '5 seconds',
           missed_heartbeat_counts = v_missed_heartbeat_counts,
           last_outcome = 'seated-humans:' || v_seated_humans::text ||
             ';active-humans:' || v_active_humans::text ||
             ';missed-windows:' || v_missed_heartbeat_counts::text,
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'seated-humans';
  END IF;

  IF v_watch.waiting_kind = 'initial' THEN
    SELECT
      EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dealer_games WHERE session_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.rounds WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.dice_roll_audit WHERE game_id = p_game_id)
      OR EXISTS (SELECT 1 FROM public.cribbage_hand_archive WHERE game_id = p_game_id)
      OR COALESCE(v_game.total_hands, 0) > 0
      OR COALESCE(v_game.pot, 0) <> 0
      OR v_game.current_game_uuid IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.players
         WHERE game_id = p_game_id AND chips <> 0
      )
      INTO v_nonpristine;

    IF v_nonpristine THEN
      UPDATE private.session_abandonment_watches
         SET last_checked_at = p_now,
             next_check_at = p_now + interval '15 minutes',
             last_outcome = 'blocked-nonpristine-initial-waiting',
             updated_at = p_now
       WHERE game_id = p_game_id;
      RETURN 'blocked-nonpristine-initial-waiting';
    END IF;

    DELETE FROM public.session_events WHERE game_id = p_game_id;
    DELETE FROM public.voice_presence_heartbeats WHERE game_id = p_game_id;
    DELETE FROM public.games WHERE id = p_game_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    RETURN CASE WHEN v_deleted = 1
      THEN 'deleted-pristine-initial-session'
      ELSE 'delete-race-lost'
    END;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND EXISTS (SELECT 1 FROM public.game_results WHERE game_id = p_game_id) THEN
    v_outcome := private.finalize_settled_session_if_no_active_humans(
      p_game_id,
      p_now
    );
    RETURN v_outcome;
  END IF;

  IF COALESCE(v_game.real_money, false)
     AND (
       EXISTS (SELECT 1 FROM public.session_player_snapshots WHERE game_id = p_game_id)
       OR EXISTS (SELECT 1 FROM public.player_transactions WHERE source_game_id = p_game_id)
       OR COALESCE(v_game.pot, 0) <> 0
       OR EXISTS (SELECT 1 FROM public.players WHERE game_id = p_game_id AND chips <> 0)
     ) THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = p_now + interval '15 minutes',
           last_outcome = 'blocked-unsettled-financial-evidence',
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'blocked-unsettled-financial-evidence';
  END IF;

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
  DELETE FROM private.postgame_forced_absence_watches
   WHERE game_id = p_game_id;

  RETURN 'session-ended-without-financial-settlement';
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
  v_kind text := 'initial';
  v_entered_waiting boolean := false;
BEGIN
  IF NEW.status IN ('waiting', 'waiting_for_players')
     AND NEW.current_game_uuid IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.game_results WHERE game_id = NEW.id)
       OR COALESCE(NEW.total_hands, 0) > 0
       OR NEW.game_over_at IS NOT NULL THEN
      v_kind := 'subsequent';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      v_entered_waiting := OLD.status NOT IN ('waiting', 'waiting_for_players')
        OR OLD.current_game_uuid IS NOT NULL;
      IF v_entered_waiting THEN
        v_kind := 'subsequent';
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.players AS player
       WHERE player.game_id = NEW.id
         AND NOT player.is_bot
         AND player.position IS NOT NULL
         AND player.status NOT IN ('observer', 'left')
    ) THEN
      IF v_entered_waiting THEN
        INSERT INTO private.session_abandonment_watches AS existing_watch (
          game_id, armed_at, zero_active_since, next_check_at,
          missed_heartbeat_counts, last_outcome, updated_at, waiting_kind
        ) VALUES (
          NEW.id, v_now, NULL, v_now + interval '5 seconds',
          '{}'::jsonb, 'armed-at-subsequent-waiting', v_now, 'subsequent'
        )
        ON CONFLICT (game_id) DO UPDATE
          SET armed_at = EXCLUDED.armed_at,
              zero_active_since = NULL,
              next_check_at = EXCLUDED.next_check_at,
              missed_heartbeat_counts = EXCLUDED.missed_heartbeat_counts,
              last_outcome = EXCLUDED.last_outcome,
              updated_at = EXCLUDED.updated_at,
              waiting_kind = EXCLUDED.waiting_kind;
      ELSE
        INSERT INTO private.session_abandonment_watches AS existing_watch (
          game_id, armed_at, zero_active_since, next_check_at,
          missed_heartbeat_counts, last_outcome, updated_at, waiting_kind
        ) VALUES (
          NEW.id, v_now, NULL, v_now + interval '5 seconds',
          '{}'::jsonb, 'armed-at-' || v_kind || '-waiting', v_now, v_kind
        )
        ON CONFLICT (game_id) DO UPDATE
          SET armed_at = EXCLUDED.armed_at,
              zero_active_since = NULL,
              next_check_at = EXCLUDED.next_check_at,
              missed_heartbeat_counts = EXCLUDED.missed_heartbeat_counts,
              last_outcome = EXCLUDED.last_outcome,
              updated_at = EXCLUDED.updated_at,
              waiting_kind = EXCLUDED.waiting_kind
          WHERE existing_watch.waiting_kind = 'initial'
            AND EXCLUDED.waiting_kind = 'subsequent';
      END IF;
    END IF;
  ELSE
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = NEW.id;
    IF NEW.status = 'session_ended' THEN
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = NEW.id;
    END IF;
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
  v_game public.games%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_kind text := 'initial';
BEGIN
  IF current_setting('ptown.session_presence_reconcile', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = NEW.game_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Canonical setup expiry is timer-forced Sitting Out even when it occurs
  -- before the session has any durable result history.
  IF TG_OP = 'UPDATE'
     AND NOT COALESCE(OLD.sitting_out, false)
     AND COALESCE(NEW.sitting_out, false)
     AND v_game.status IN ('dealer_selection', 'game_selection', 'configuring')
     AND v_game.config_deadline IS NOT NULL
     AND v_game.config_deadline <= v_now
     AND NEW.position = v_game.dealer_position
     AND NOT COALESCE(NEW.is_bot, false) THEN
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    ) VALUES (
      NEW.game_id, NEW.id, v_now, 'config_timeout'
    )
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  END IF;

  -- Canonical ante expiry is timer-forced Sitting Out, while an ante choice
  -- made before the deadline remains voluntary.
  IF TG_OP = 'UPDATE'
     AND NOT COALESCE(OLD.sitting_out, false)
     AND COALESCE(NEW.sitting_out, false)
     AND OLD.ante_decision IS NULL
     AND NEW.ante_decision = 'sit_out'
     AND v_game.status = 'ante_decision'
     AND v_game.ante_decision_deadline IS NOT NULL
     AND v_game.ante_decision_deadline <= v_now
     AND NOT COALESCE(NEW.is_bot, false) THEN
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    ) VALUES (
      NEW.game_id, NEW.id, v_now, 'ante_timeout'
    )
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  END IF;

  IF v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.players AS player
        WHERE player.game_id = v_game.id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
     ) THEN
    IF EXISTS (SELECT 1 FROM public.game_results WHERE game_id = v_game.id)
       OR COALESCE(v_game.total_hands, 0) > 0
       OR v_game.game_over_at IS NOT NULL THEN
      v_kind := 'subsequent';
    END IF;

    INSERT INTO private.session_abandonment_watches AS existing_watch (
      game_id, armed_at, zero_active_since, next_check_at,
      missed_heartbeat_counts, last_outcome, updated_at, waiting_kind
    ) VALUES (
      v_game.id, v_now, NULL, v_now + interval '5 seconds',
      '{}'::jsonb, 'armed-by-' || v_kind || '-player-signal', v_now, v_kind
    )
    ON CONFLICT (game_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          zero_active_since = NULL,
          next_check_at = EXCLUDED.next_check_at,
          missed_heartbeat_counts = EXCLUDED.missed_heartbeat_counts,
          last_outcome = EXCLUDED.last_outcome,
          updated_at = EXCLUDED.updated_at,
          waiting_kind = EXCLUDED.waiting_kind
      WHERE existing_watch.waiting_kind = 'initial'
        AND EXCLUDED.waiting_kind = 'subsequent';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stand_up_and_resolve_postgame(
  p_game_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_player_id uuid;
  v_active_humans integer := 0;
  v_active_players integer := 0;
  v_seated_humans integer := 0;
  v_has_settled_result boolean := false;
  v_is_subsequent boolean := false;
  v_lifecycle_resolved boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT * INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'missing-game',
      'lifecycle_resolved', false
    );
  END IF;

  SELECT player.id INTO v_player_id
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.user_id = auth.uid()
     AND NOT player.is_bot
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'not-authorized',
      'lifecycle_resolved', false
    );
  END IF;

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players
     SET status = 'left',
         sitting_out = true,
         stand_up_next_hand = false,
         sit_out_next_hand = false,
         ante_decision = NULL,
         auto_ante = false,
         auto_ante_runback = false,
         auto_fold = false,
         waiting = false
   WHERE id = v_player_id;

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  UPDATE public.games AS game
     SET current_host = (
       SELECT player.user_id
         FROM public.players AS player
        WHERE player.game_id = p_game_id
          AND NOT player.is_bot
          AND player.position IS NOT NULL
          AND player.status NOT IN ('observer', 'left')
        ORDER BY player.created_at, player.id
        LIMIT 1
     )
   WHERE game.id = p_game_id
     AND NOT EXISTS (
       SELECT 1
         FROM public.players AS host_player
        WHERE host_player.game_id = game.id
          AND host_player.user_id = game.current_host
          AND NOT host_player.is_bot
          AND host_player.position IS NOT NULL
          AND host_player.status NOT IN ('observer', 'left')
     );

  SELECT
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.is_bot
        AND NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    ),
    count(*) FILTER (
      WHERE NOT player.sitting_out
        AND player.position IS NOT NULL
        AND player.status NOT IN ('observer', 'left')
    )
    INTO v_seated_humans, v_active_humans, v_active_players
    FROM public.players AS player
   WHERE player.game_id = p_game_id;

  IF v_game.status = 'session_ended' THEN
    RETURN jsonb_build_object(
      'outcome', 'already-session-ended',
      'lifecycle_resolved', true,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.game_results WHERE game_id = p_game_id
  ) INTO v_has_settled_result;

  SELECT v_has_settled_result OR EXISTS (
    SELECT 1
      FROM private.session_abandonment_watches AS watch
     WHERE watch.game_id = p_game_id
       AND watch.waiting_kind = 'subsequent'
  ) INTO v_is_subsequent;

  IF NOT v_is_subsequent
     AND v_game.status IN ('waiting', 'waiting_for_players')
     AND v_game.current_game_uuid IS NULL
     AND v_seated_humans = 0 THEN
    v_outcome := private.reconcile_session_abandonment(p_game_id, v_now);

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_outcome = 'deleted-pristine-initial-session',
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF NOT v_is_subsequent
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'ante_decision', 'game_over'
     ) THEN
    RETURN jsonb_build_object(
      'outcome', 'stand-up-recorded-outside-postgame',
      'lifecycle_resolved', false,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  v_lifecycle_resolved := true;

  IF v_seated_humans = 0 THEN
    IF COALESCE(v_game.real_money, false) AND v_has_settled_result THEN
      v_outcome := private.finalize_settled_session_if_no_active_humans(
        p_game_id,
        v_now
      );
    ELSE
      UPDATE public.games
         SET status = 'session_ended',
             pending_session_end = false,
             session_ended_at = v_now,
             game_over_at = COALESCE(game_over_at, v_now),
             is_paused = false
       WHERE id = p_game_id
         AND status <> 'session_ended';

      DELETE FROM private.session_abandonment_watches
       WHERE game_id = p_game_id;
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = p_game_id;

      v_outcome := 'session-ended-without-financial-settlement';
    END IF;

    RETURN jsonb_build_object(
      'outcome', v_outcome,
      'lifecycle_resolved', v_lifecycle_resolved,
      'seated_humans', v_seated_humans,
      'active_humans', v_active_humans,
      'active_players', v_active_players
    );
  END IF;

  IF v_active_players < 2 THEN
    UPDATE public.games
       SET status = 'waiting',
           current_game_uuid = NULL,
           config_complete = false,
           config_deadline = NULL,
           ante_decision_deadline = NULL,
           awaiting_next_round = false,
           last_round_result = NULL
     WHERE id = p_game_id;

    v_outcome := 'waiting-insufficient-eligible-participants';
  ELSE
    v_outcome := 'eligible-participants-remain';
  END IF;

  RETURN jsonb_build_object(
    'outcome', v_outcome,
    'lifecycle_resolved', v_lifecycle_resolved,
    'seated_humans', v_seated_humans,
    'active_humans', v_active_humans,
    'active_players', v_active_players
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.resolve_postgame_participation(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reconcile_session_abandonment(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.on_game_abandonment_boundary()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.on_player_abandonment_signal()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stand_up_and_resolve_postgame(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stand_up_and_resolve_postgame(uuid)
  TO authenticated;
