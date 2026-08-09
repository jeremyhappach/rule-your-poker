-- Fast post-game absence confirmation is scoped to an already-armed,
-- result-bearing real-money Waiting table. The normal global heartbeat stays
-- observational; this server-side watch is the only lifecycle authority.

ALTER TABLE private.session_abandonment_watches
  ADD COLUMN IF NOT EXISTS missed_heartbeat_counts jsonb
    NOT NULL DEFAULT '{}'::jsonb;

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
  v_missed_heartbeat_counts jsonb := '{}'::jsonb;
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

  -- Presence reconciliation is legal only at a settled post-game Waiting
  -- boundary. Initial waiting rooms and every live dealer-game state stay out.
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

  -- Count complete five-second windows since each human's latest eligible
  -- server-stamped heartbeat after the exact post-game boundary. Computing
  -- elapsed windows (rather than trusting cron invocations) preserves the
  -- three-miss rule even if one scheduled sweep is delayed.
  SELECT COALESCE(
    jsonb_object_agg(
      player.id::text,
      GREATEST(
        0,
        floor(
          EXTRACT(EPOCH FROM (
            p_now - COALESCE(
              (
                SELECT max(heartbeat.updated_at)
                  FROM public.voice_presence_heartbeats AS heartbeat
                 WHERE heartbeat.game_id = p_game_id
                   AND heartbeat.user_id = player.user_id
                   AND heartbeat.status IN ('active', 'hidden')
                   AND heartbeat.updated_at >= v_watch.armed_at
              ),
              v_watch.armed_at
            )
          )) / 5
        )::integer
      )
    ),
    '{}'::jsonb
  ) INTO v_missed_heartbeat_counts
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players AS player
     SET sitting_out = true,
         waiting = false
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left')
     AND COALESCE(
       (v_missed_heartbeat_counts ->> player.id::text)::integer,
       0
     ) >= 3;

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
           next_check_at = p_now + interval '5 seconds',
           missed_heartbeat_counts = v_missed_heartbeat_counts,
           last_outcome = 'active-humans:' || v_active_humans::text ||
             ';missed-windows:' || v_missed_heartbeat_counts::text,
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
    -- Arm once. Later waiting-table writes must never re-arm the absence
    -- clock or erase prior missed windows.
    INSERT INTO private.session_abandonment_watches (
      game_id, armed_at, zero_active_since, next_check_at,
      missed_heartbeat_counts, last_outcome, updated_at
    ) VALUES (
      NEW.id, v_now, NULL, v_now + interval '5 seconds',
      '{}'::jsonb, 'armed-at-postgame-waiting', v_now
    )
    ON CONFLICT (game_id) DO NOTHING;
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

  -- This trigger covers the narrow ordering where a player update lands
  -- after result history exists but before a status write arms the watch. It
  -- never moves an existing watch's deadline or evaluates lifecycle state.
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
      game_id, armed_at, next_check_at, missed_heartbeat_counts,
      last_outcome, updated_at
    ) VALUES (
      v_game_id, v_now, v_now + interval '5 seconds', '{}'::jsonb,
      'armed-by-postgame-player-signal', v_now
    )
    ON CONFLICT (game_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid
    INTO v_job_id
    FROM cron.job
   WHERE jobname = 'reconcile-abandoned-real-money-sessions';

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION
      'Missing cron job reconcile-abandoned-real-money-sessions';
  END IF;

  PERFORM cron.alter_job(
    job_id := v_job_id,
    schedule := '5 seconds'
  );
END
$schedule$;
