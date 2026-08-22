-- Preserve voluntary Sitting Out seat ownership while allowing a setup owner
-- who disappeared before their canonical config timeout to be stood up after
-- server-observed absence. Hidden browser tabs keep a longer configurable
-- lease because background timer throttling is not departure evidence.

CREATE TABLE IF NOT EXISTS private.postgame_forced_absence_watches (
  game_id uuid NOT NULL
    REFERENCES public.games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL
    REFERENCES public.players(id) ON DELETE CASCADE,
  armed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason text NOT NULL CHECK (reason IN ('config_timeout')),
  PRIMARY KEY (game_id, player_id)
);

ALTER TABLE private.postgame_forced_absence_watches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.postgame_forced_absence_watches
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE private.postgame_forced_absence_watches TO service_role;

CREATE INDEX IF NOT EXISTS postgame_forced_absence_watches_due_idx
  ON private.postgame_forced_absence_watches(game_id, armed_at, player_id);

-- This timestamp is a lifecycle lease, so it must represent the actual server
-- write rather than PostgreSQL's transaction-start `now()`. The difference is
-- normally tiny, but a long transaction must not make a fresh heartbeat stale.
CREATE OR REPLACE FUNCTION private.stamp_voice_presence_heartbeat_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.stamp_voice_presence_heartbeat_updated_at()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vph_updated_at
  ON public.voice_presence_heartbeats;
CREATE TRIGGER trg_vph_updated_at
  BEFORE INSERT OR UPDATE ON public.voice_presence_heartbeats
  FOR EACH ROW
  EXECUTE FUNCTION private.stamp_voice_presence_heartbeat_updated_at();

INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'postgame_presence',
  '{"hidden_grace_seconds":300}'::jsonb,
  clock_timestamp()
)
ON CONFLICT (key) DO NOTHING;

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
  v_hidden_grace_seconds integer := 300;
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
  IF v_game.status NOT IN ('waiting', 'waiting_for_players')
     OR v_game.current_game_uuid IS NOT NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.game_results WHERE game_id = p_game_id
     ) THEN
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

  SELECT CASE
           WHEN setting.value ->> 'hidden_grace_seconds' ~ '^[0-9]+$'
             THEN LEAST(
               3600,
               GREATEST(
                 30,
                 (setting.value ->> 'hidden_grace_seconds')::integer
               )
             )
           ELSE 300
         END
    INTO v_hidden_grace_seconds
    FROM public.system_settings AS setting
   WHERE setting.key = 'postgame_presence'
   LIMIT 1;
  v_hidden_grace_seconds := COALESCE(v_hidden_grace_seconds, 300);

  -- The diagnostic count remains expressed as effective five-second missed
  -- windows. An active or absent tab keeps the accepted three-window rule.
  -- A latest hidden heartbeat shifts those windows by the configured hidden
  -- grace, preventing browser background throttling from impersonating exit.
  SELECT COALESCE(
    jsonb_object_agg(
      player.id::text,
      GREATEST(
        0,
        floor(
          (
            EXTRACT(EPOCH FROM (
              p_now - COALESCE(latest_heartbeat.updated_at, v_watch.armed_at)
            ))
            - CASE
                WHEN latest_heartbeat.status = 'hidden'
                  THEN GREATEST(v_hidden_grace_seconds - 15, 0)
                ELSE 0
              END
          ) / 5
        )::integer
      )
    ),
    '{}'::jsonb
  ) INTO v_missed_heartbeat_counts
    FROM public.players AS player
    LEFT JOIN LATERAL (
      SELECT heartbeat.updated_at, heartbeat.status
        FROM public.voice_presence_heartbeats AS heartbeat
       WHERE heartbeat.game_id = p_game_id
         AND heartbeat.user_id = player.user_id
         AND heartbeat.status IN ('active', 'hidden')
         AND heartbeat.updated_at >= v_watch.armed_at
       ORDER BY heartbeat.updated_at DESC, heartbeat.id DESC
       LIMIT 1
    ) AS latest_heartbeat ON true
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);
  PERFORM set_config('app.three_five_seven_authoritative_write', 'on', true);

  -- A heartbeat after the exact config-timeout boundary proves that the
  -- player is still present. They remain voluntarily Sitting Out with their
  -- physical seat, and the forced-absence claim is retired.
  DELETE FROM private.postgame_forced_absence_watches AS forced
   WHERE forced.game_id = p_game_id
     AND (
       NOT EXISTS (
         SELECT 1
           FROM public.players AS player
          WHERE player.id = forced.player_id
            AND player.game_id = forced.game_id
            AND player.is_bot = false
            AND player.sitting_out = true
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

  -- A setup owner who has supplied no heartbeat for three complete windows
  -- after config expiry is canonically stood up. This exact private marker is
  -- what distinguishes forced absence from ordinary Sitting Out.
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
     AND player.is_bot = false
     AND player.sitting_out = true
     AND player.status NOT IN ('observer', 'left')
     AND p_now >= forced.armed_at + interval '15 seconds'
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
       OR player.sitting_out = false
     );

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

  IF COALESCE(v_game.real_money, false) THEN
    v_outcome := private.finalize_settled_session_if_no_active_humans(
      p_game_id,
      p_now
    );
    RETURN v_outcome;
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
BEGIN
  IF NEW.status IN ('waiting', 'waiting_for_players')
     AND NEW.current_game_uuid IS NULL
     AND EXISTS (
       SELECT 1 FROM public.game_results WHERE game_id = NEW.id
     ) THEN
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
    IF NEW.status = 'session_ended' THEN
      DELETE FROM private.postgame_forced_absence_watches
       WHERE game_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.handle_config_deadline_timeout_exact(
  p_game_id uuid,
  p_expected_deadline timestamptz DEFAULT NULL,
  p_expected_dealer_position integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_game public.games%ROWTYPE;
  v_dealer_id uuid;
  v_next_dealer_pos integer;
  v_allow_bot boolean := false;
  v_setup_seconds integer;
  v_new_deadline timestamptz;
  v_active_total integer;
  v_active_humans integer;
  v_outcome text;
  v_forced_absence_armed_at timestamptz;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','game-not-found');
  END IF;
  IF p_expected_deadline IS NOT NULL
     AND v_game.config_deadline IS DISTINCT FROM p_expected_deadline THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','stale-deadline');
  END IF;
  IF p_expected_dealer_position IS NOT NULL
     AND v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RETURN jsonb_build_object('outcome','suppressed','reason','stale-dealer');
  END IF;
  IF v_game.status NOT IN ('dealer_selection','configuring','game_selection')
     OR coalesce(v_game.config_complete,false)
     OR coalesce(v_game.is_paused,false)
     OR v_game.config_deadline IS NULL
     OR v_game.config_deadline > clock_timestamp() THEN
    RETURN jsonb_build_object(
      'outcome','suppressed','reason','game-advanced-or-not-expired',
      'status',v_game.status,'config_deadline',v_game.config_deadline
    );
  END IF;

  SELECT player.id INTO v_dealer_id FROM public.players player
   WHERE player.game_id = p_game_id
     AND player.position = v_game.dealer_position LIMIT 1;
  IF v_dealer_id IS NOT NULL THEN
    v_forced_absence_armed_at := clock_timestamp();
    UPDATE public.players SET sitting_out=true,waiting=false
     WHERE id=v_dealer_id;
    INSERT INTO private.postgame_forced_absence_watches (
      game_id, player_id, armed_at, reason
    )
    SELECT player.game_id, player.id, v_forced_absence_armed_at, 'config_timeout'
      FROM public.players AS player
     WHERE player.id = v_dealer_id
       AND player.is_bot = false
       AND EXISTS (
         SELECT 1
           FROM public.game_results AS result
          WHERE result.game_id = player.game_id
       )
    ON CONFLICT (game_id, player_id) DO UPDATE
      SET armed_at = EXCLUDED.armed_at,
          reason = EXCLUDED.reason;
  END IF;

  SELECT coalesce(defaults.allow_bot_dealers,false) INTO v_allow_bot
    FROM public.game_defaults defaults
   WHERE defaults.game_type = coalesce(v_game.game_type,'holm') LIMIT 1;
  v_allow_bot := coalesce(v_allow_bot,false);
  v_setup_seconds := greatest(1,coalesce(nullif(v_game.game_setup_timer_seconds,0),30));

  SELECT count(*),
         count(*) FILTER (WHERE NOT coalesce(player.is_bot,false))
    INTO v_active_total,v_active_humans
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left');

  IF v_active_humans = 0 THEN
    v_outcome := private.resolve_postgame_participation(p_game_id,clock_timestamp());
    RETURN jsonb_build_object('outcome',CASE
      WHEN v_outcome='session-ended-with-results' THEN 'session_ended'
      ELSE 'waiting' END,'reason',v_outcome);
  END IF;

  SELECT player.position INTO v_next_dealer_pos
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.position IS NOT NULL
     AND player.status NOT IN ('observer','left')
     AND (v_allow_bot OR NOT coalesce(player.is_bot,false))
     AND (v_dealer_id IS NULL OR player.id<>v_dealer_id)
   ORDER BY CASE WHEN player.position>coalesce(v_game.dealer_position,0) THEN 0 ELSE 1 END,
            player.position
   LIMIT 1;

  IF v_next_dealer_pos IS NOT NULL AND v_active_total>=2 THEN
    v_new_deadline:=clock_timestamp()+make_interval(secs=>v_setup_seconds);
    UPDATE public.games
       SET dealer_position=v_next_dealer_pos,
           config_deadline=v_new_deadline,
           config_complete=false,
           current_game_uuid=NULL
     WHERE id=p_game_id;
    RETURN jsonb_build_object(
      'outcome','rotated','new_dealer_position',v_next_dealer_pos,
      'new_config_deadline',v_new_deadline,'active_total',v_active_total
    );
  END IF;

  UPDATE public.games
     SET status='waiting',config_deadline=NULL,ante_decision_deadline=NULL,
         config_complete=false,awaiting_next_round=false,
         last_round_result=NULL,current_game_uuid=NULL
   WHERE id=p_game_id;
  RETURN jsonb_build_object('outcome','waiting','active_humans',v_active_humans);
END;
$function$;
