-- Authoritative real-money session abandonment handling.
--
-- Existing browser heartbeats already receive a server timestamp through
-- trg_vph_updated_at. This migration uses that timestamp as a presence lease,
-- reacts only at safe session boundaries, and adds a narrow database cron as
-- the no-client fallback. Existing sessions are intentionally not backfilled
-- into the watch table; only post-deployment boundaries/player signals enter
-- this lifecycle.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE private.session_abandonment_watches (
  game_id uuid PRIMARY KEY
    REFERENCES public.games(id) ON DELETE CASCADE,
  armed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  zero_active_since timestamptz,
  last_checked_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_outcome text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE private.session_abandonment_watches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.session_abandonment_watches
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE private.session_abandonment_watches TO service_role;

CREATE INDEX session_abandonment_watches_due_idx
  ON private.session_abandonment_watches(next_check_at, game_id);

-- The client supplies last_heartbeat_at for voice diagnostics, but this column
-- is stamped by the database trigger and is therefore the lifecycle lease.
DROP TRIGGER IF EXISTS trg_vph_updated_at
  ON public.voice_presence_heartbeats;
CREATE TRIGGER trg_vph_updated_at
  BEFORE INSERT OR UPDATE ON public.voice_presence_heartbeats
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS voice_presence_game_user_server_seen_idx
  ON public.voice_presence_heartbeats(game_id, user_id, updated_at DESC);

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
  v_result_count integer := 0;
  v_snapshot_count integer := 0;
  v_transaction_count integer := 0;
  v_dealer_game_count integer := 0;
  v_round_count integer := 0;
  v_dice_audit_count integer := 0;
  v_missing_or_stale_snapshot boolean := false;
  v_has_nonzero_player_chips boolean := false;
  v_outcome text;
BEGIN
  IF p_game_id IS NULL THEN
    RETURN 'missing-game-id';
  END IF;

  SELECT *
    INTO v_game
    FROM public.games
   WHERE id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing-game';
  END IF;

  IF NOT COALESCE(v_game.real_money, false)
     OR v_game.status NOT IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'game_over'
     ) THEN
    DELETE FROM private.session_abandonment_watches
     WHERE game_id = p_game_id;
    RETURN 'ineligible-state';
  END IF;

  SELECT *
    INTO v_watch
    FROM private.session_abandonment_watches
   WHERE game_id = p_game_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'unarmed';
  END IF;

  -- Three missed four-second beats are required before a player becomes
  -- absent. Newly seated players receive the same grace even before their
  -- first contextual heartbeat lands.
  PERFORM set_config('ptown.session_presence_reconcile', 'on', true);

  UPDATE public.players AS player
     SET sitting_out = true,
         waiting = false
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left')
     AND player.created_at < p_now - interval '15 seconds'
     AND NOT EXISTS (
       SELECT 1
         FROM public.voice_presence_heartbeats AS heartbeat
        WHERE heartbeat.game_id = p_game_id
          AND heartbeat.user_id = player.user_id
          AND heartbeat.status IN ('active', 'hidden')
          AND heartbeat.updated_at >= p_now - interval '15 seconds'
     );

  PERFORM set_config('ptown.session_presence_reconcile', 'off', true);

  SELECT count(*)
    INTO v_active_humans
    FROM public.players AS player
   WHERE player.game_id = p_game_id
     AND player.is_bot = false
     AND player.sitting_out = false
     AND player.status NOT IN ('observer', 'left');

  IF v_active_humans > 0 THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = NULL,
           last_checked_at = p_now,
           next_check_at = p_now + interval '10 seconds',
           last_outcome = 'active-humans:' || v_active_humans::text,
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'active-humans';
  END IF;

  -- Closing is a separate server observation from the one that first found
  -- zero active humans. A returning client can rejoin before this fires.
  IF v_watch.zero_active_since IS NULL THEN
    UPDATE private.session_abandonment_watches
       SET zero_active_since = p_now,
           last_checked_at = p_now,
           next_check_at = p_now + interval '10 seconds',
           last_outcome = 'zero-active-unconfirmed',
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'zero-active-unconfirmed';
  END IF;

  IF v_watch.zero_active_since > p_now - interval '10 seconds' THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = v_watch.zero_active_since + interval '10 seconds',
           last_outcome = 'zero-active-unconfirmed',
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'zero-active-unconfirmed';
  END IF;

  SELECT count(*) INTO v_result_count
    FROM public.game_results WHERE game_id = p_game_id;
  SELECT count(DISTINCT user_id) INTO v_snapshot_count
    FROM public.session_player_snapshots
   WHERE game_id = p_game_id AND is_bot = false;
  SELECT count(*) INTO v_transaction_count
    FROM public.player_transactions WHERE source_game_id = p_game_id;
  SELECT count(*) INTO v_dealer_game_count
    FROM public.dealer_games WHERE session_id = p_game_id;
  SELECT count(*) INTO v_round_count
    FROM public.rounds WHERE game_id = p_game_id;
  SELECT count(*) INTO v_dice_audit_count
    FROM public.dice_roll_audit WHERE game_id = p_game_id;
  SELECT EXISTS (
    SELECT 1 FROM public.players
     WHERE game_id = p_game_id AND chips <> 0
  ) INTO v_has_nonzero_player_chips;

  IF v_result_count > 0 THEN
    -- record_session_results reads the latest human snapshot. Refuse a close
    -- if a current human is missing that snapshot or its balance is stale.
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
                      snapshot.user_id, snapshot.chips
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
      UPDATE private.session_abandonment_watches
         SET last_checked_at = p_now,
             next_check_at = p_now + interval '15 minutes',
             last_outcome = 'blocked-incomplete-final-snapshots',
             updated_at = p_now
       WHERE game_id = p_game_id;
      RETURN 'blocked-incomplete-final-snapshots';
    END IF;

    -- The existing AFTER UPDATE trigger mints one SessionResult per human in
    -- this same transaction. Its unique key makes this transition replay-safe.
    UPDATE public.games
       SET status = 'session_ended',
           pending_session_end = false,
           session_ended_at = p_now,
           game_over_at = COALESCE(game_over_at, p_now),
           is_paused = false
     WHERE id = p_game_id
       AND status IN (
         'waiting', 'waiting_for_players', 'dealer_selection',
         'game_selection', 'configuring', 'game_over'
       );

    RETURN 'session-ended-with-results';
  END IF;

  -- No game_results is necessary but not sufficient for deletion. Preserve
  -- any session with evidence that play or money movement may have started.
  IF v_snapshot_count > 0
     OR v_transaction_count > 0
     OR v_dealer_game_count > 0
     OR v_round_count > 0
     OR v_dice_audit_count > 0
     OR COALESCE(v_game.total_hands, 0) > 0
     OR COALESCE(v_game.pot, 0) <> 0
     OR v_game.current_game_uuid IS NOT NULL
     OR v_has_nonzero_player_chips THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = p_now + interval '15 minutes',
           last_outcome = 'blocked-unsettled-history',
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'blocked-unsettled-history';
  END IF;

  -- A truly unused real-money room is disposable, but only after a much
  -- longer absence window than a settled session.
  IF v_watch.zero_active_since > p_now - interval '15 minutes' THEN
    UPDATE private.session_abandonment_watches
       SET last_checked_at = p_now,
           next_check_at = v_watch.zero_active_since + interval '15 minutes',
           last_outcome = 'pristine-session-grace',
           updated_at = p_now
     WHERE game_id = p_game_id;
    RETURN 'pristine-session-grace';
  END IF;

  DELETE FROM public.chat_messages WHERE game_id = p_game_id;
  DELETE FROM public.chat_operation_reports WHERE game_id = p_game_id;
  DELETE FROM public.chat_send_operations WHERE game_id = p_game_id;
  DELETE FROM public.chip_stack_emoticons WHERE game_id = p_game_id;
  DELETE FROM public.session_events WHERE game_id = p_game_id;
  DELETE FROM public.voice_presence_heartbeats WHERE game_id = p_game_id;
  DELETE FROM public.players WHERE game_id = p_game_id;
  DELETE FROM public.games WHERE id = p_game_id;

  GET DIAGNOSTICS v_active_humans = ROW_COUNT;
  v_outcome := CASE WHEN v_active_humans = 1
    THEN 'deleted-pristine-session'
    ELSE 'delete-race-lost'
  END;
  RETURN v_outcome;
END;
$function$;

CREATE OR REPLACE FUNCTION private.reconcile_abandoned_sessions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_watch record;
  v_processed integer := 0;
BEGIN
  FOR v_watch IN
    SELECT watch.game_id
      FROM private.session_abandonment_watches AS watch
     WHERE watch.next_check_at <= clock_timestamp()
     ORDER BY watch.next_check_at, watch.game_id
     LIMIT 50
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM private.reconcile_session_abandonment(
      v_watch.game_id,
      clock_timestamp()
    );
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
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
     AND NEW.status IN (
       'waiting', 'waiting_for_players', 'dealer_selection',
       'game_selection', 'configuring', 'game_over'
     ) THEN
    INSERT INTO private.session_abandonment_watches (
      game_id, armed_at, zero_active_since, next_check_at,
      last_outcome, updated_at
    ) VALUES (
      NEW.id, v_now, NULL, v_now,
      'armed-at-boundary', v_now
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
       AND game.status IN (
         'waiting', 'waiting_for_players', 'dealer_selection',
         'game_selection', 'configuring', 'game_over'
       )
  ) THEN
    INSERT INTO private.session_abandonment_watches (
      game_id, armed_at, next_check_at, last_outcome, updated_at
    ) VALUES (
      v_game_id, v_now, v_now, 'armed-by-player-signal', v_now
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

REVOKE ALL ON FUNCTION private.reconcile_session_abandonment(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reconcile_abandoned_sessions()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.on_game_abandonment_boundary()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.on_player_abandonment_signal()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.reconcile_session_abandonment(uuid, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.reconcile_abandoned_sessions()
  TO service_role;

DROP TRIGGER IF EXISTS trg_session_abandonment_game_insert ON public.games;
CREATE TRIGGER trg_session_abandonment_game_insert
  AFTER INSERT ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION private.on_game_abandonment_boundary();

DROP TRIGGER IF EXISTS trg_session_abandonment_game_status ON public.games;
CREATE TRIGGER trg_session_abandonment_game_status
  AFTER UPDATE OF status, real_money ON public.games
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.real_money IS DISTINCT FROM NEW.real_money
  )
  EXECUTE FUNCTION private.on_game_abandonment_boundary();

DROP TRIGGER IF EXISTS trg_session_abandonment_player_insert ON public.players;
CREATE TRIGGER trg_session_abandonment_player_insert
  AFTER INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION private.on_player_abandonment_signal();

DROP TRIGGER IF EXISTS trg_session_abandonment_player_state ON public.players;
CREATE TRIGGER trg_session_abandonment_player_state
  AFTER UPDATE OF sitting_out, status ON public.players
  FOR EACH ROW
  WHEN (
    OLD.sitting_out IS DISTINCT FROM NEW.sitting_out
    OR OLD.status IS DISTINCT FROM NEW.status
  )
  EXECUTE FUNCTION private.on_player_abandonment_signal();

DO $schedule$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
      FROM cron.job
     WHERE jobname = 'reconcile-abandoned-real-money-sessions'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'reconcile-abandoned-real-money-sessions',
    '10 seconds',
    $cron$SELECT private.reconcile_abandoned_sessions();$cron$
  );
END
$schedule$;
