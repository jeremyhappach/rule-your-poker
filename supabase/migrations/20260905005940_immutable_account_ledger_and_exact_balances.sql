-- Preserve existing account history; new commands append records and reversals.
ALTER TABLE public.player_transactions
 ADD COLUMN request_id uuid,
 ADD COLUMN actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
 ADD COLUMN reversal_of uuid REFERENCES public.player_transactions(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX player_transactions_request_key ON public.player_transactions(request_id);
CREATE UNIQUE INDEX player_transactions_reversal_key ON public.player_transactions(reversal_of);
CREATE INDEX player_transactions_statement_key ON public.player_transactions(profile_id,date DESC,id DESC);
ALTER TABLE public.player_transactions DROP CONSTRAINT player_transactions_transaction_type_check;
ALTER TABLE public.player_transactions ADD CONSTRAINT player_transactions_transaction_type_check
 CHECK(transaction_type IN ('SessionResult','Deposit','Payout','Reversal'));
ALTER TABLE public.player_transactions DROP CONSTRAINT player_transactions_profile_id_fkey;
ALTER TABLE public.player_transactions ADD CONSTRAINT player_transactions_profile_id_fkey
 FOREIGN KEY(profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.player_transactions DROP CONSTRAINT player_transactions_source_game_id_fkey;
ALTER TABLE public.player_transactions ADD CONSTRAINT player_transactions_source_game_id_fkey
 FOREIGN KEY(source_game_id) REFERENCES public.games(id) ON DELETE RESTRICT;

CREATE FUNCTION private.reject_account_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'account_history:append_only' USING ERRCODE='42501'; END;
$$;
CREATE TRIGGER reject_account_history_mutation BEFORE UPDATE OR DELETE ON public.player_transactions
FOR EACH ROW EXECUTE FUNCTION private.reject_account_history_mutation();
CREATE TRIGGER reject_account_history_truncate BEFORE TRUNCATE ON public.player_transactions
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_account_history_mutation();
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.player_transactions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.guard_session_financial_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.real_money IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'session_history:real_money_requires_archival' USING ERRCODE='42501';
  END IF;
  RETURN OLD;
 END IF;
 IF current_user IN ('anon','authenticated') AND OLD.real_money IS DISTINCT FROM NEW.real_money THEN
  RAISE EXCEPTION 'session_history:money_mode_is_immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_session_financial_history BEFORE UPDATE OR DELETE ON public.games
FOR EACH ROW EXECUTE FUNCTION private.guard_session_financial_history();

CREATE FUNCTION public.admin_record_account_entry(p_request_id uuid,p_profile_id uuid,p_type text,p_amount text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE amount public.player_transactions.amount%TYPE; entry public.player_transactions%ROWTYPE; notes text:=nullif(btrim(p_notes),'');
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
  RAISE EXCEPTION 'account_entry:not_authorized' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_profile_id IS NULL OR p_type IS NULL OR p_type NOT IN ('Deposit','Payout')
   OR p_amount IS NULL OR length(p_amount)>32 OR p_amount !~ '^[0-9]+(\.[0-9]{1,2})?$'
   OR length(coalesce(notes,''))>2000 THEN RAISE EXCEPTION 'account_entry:invalid_input'; END IF;
 amount:=p_amount::numeric;
 IF amount<=0 THEN RAISE EXCEPTION 'account_entry:positive_amount_required'; END IF;
 IF p_type='Payout' THEN amount:=-amount; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-entry:'||p_request_id::text,0));
 SELECT * INTO entry FROM public.player_transactions WHERE request_id=p_request_id;
 IF FOUND THEN
  IF entry.profile_id IS DISTINCT FROM p_profile_id OR entry.actor_id IS DISTINCT FROM auth.uid()
    OR entry.transaction_type IS DISTINCT FROM p_type OR entry.amount IS DISTINCT FROM amount OR entry.notes IS DISTINCT FROM notes THEN
   RAISE EXCEPTION 'account_entry:request_payload_mismatch';
  END IF;
  RETURN jsonb_build_object('outcome','already_recorded','id',entry.id,'amount',entry.amount::text);
 END IF;
 PERFORM 1 FROM public.profiles WHERE id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'account_entry:profile_not_found'; END IF;
 INSERT INTO public.player_transactions(profile_id,transaction_type,amount,notes,request_id,actor_id)
 VALUES(p_profile_id,p_type,amount,notes,p_request_id,auth.uid()) RETURNING * INTO entry;
 RETURN jsonb_build_object('outcome','recorded','id',entry.id,'amount',entry.amount::text);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_account_entry(uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_record_account_entry(uuid,uuid,text,text,text) TO authenticated;

CREATE FUNCTION public.admin_reverse_account_entry(p_request_id uuid,p_entry_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original public.player_transactions%ROWTYPE; entry public.player_transactions%ROWTYPE; reason text:=nullif(btrim(p_reason),'');
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
  RAISE EXCEPTION 'account_reversal:not_authorized' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_entry_id IS NULL OR reason IS NULL OR length(reason)>2000 THEN
  RAISE EXCEPTION 'account_reversal:reason_and_identity_required';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('account-entry:'||p_request_id::text,0));
 SELECT * INTO entry FROM public.player_transactions WHERE request_id=p_request_id;
 IF FOUND THEN
  IF entry.reversal_of IS DISTINCT FROM p_entry_id OR entry.actor_id IS DISTINCT FROM auth.uid() OR entry.notes IS DISTINCT FROM reason THEN
   RAISE EXCEPTION 'account_reversal:request_payload_mismatch';
  END IF;
  RETURN jsonb_build_object('outcome','already_reversed','id',entry.id);
 END IF;
 SELECT * INTO original FROM public.player_transactions WHERE id=p_entry_id FOR UPDATE;
 IF NOT FOUND OR original.transaction_type='Reversal' THEN RAISE EXCEPTION 'account_reversal:invalid_original'; END IF;
 SELECT * INTO entry FROM public.player_transactions WHERE reversal_of=p_entry_id;
 IF FOUND THEN RETURN jsonb_build_object('outcome','already_reversed','id',entry.id); END IF;
 INSERT INTO public.player_transactions(profile_id,transaction_type,amount,notes,source_game_id,request_id,actor_id,reversal_of)
 VALUES(original.profile_id,'Reversal',-original.amount,reason,original.source_game_id,p_request_id,auth.uid(),original.id)
 RETURNING * INTO entry;
 RETURN jsonb_build_object('outcome','reversed','id',entry.id,'amount',entry.amount::text);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reverse_account_entry(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reverse_account_entry(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.account_statement(p_profile_id uuid,p_limit integer DEFAULT 50,p_before_date timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; page_limit integer:=least(100,greatest(1,coalesce(p_limit,50)));
BEGIN
 IF auth.uid() IS NULL OR (p_profile_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin'::public.app_role)) THEN
  RAISE EXCEPTION 'account_statement:not_authorized' USING ERRCODE='42501';
 END IF;
 IF p_profile_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_profile_id)
    OR (p_before_date IS NULL)<>(p_before_id IS NULL) THEN RAISE EXCEPTION 'account_statement:invalid_identity'; END IF;
 WITH page AS MATERIALIZED (
  SELECT t.* FROM public.player_transactions t WHERE t.profile_id=p_profile_id
   AND (p_before_date IS NULL OR (t.date,t.id)<(p_before_date,p_before_id))
  ORDER BY t.date DESC,t.id DESC LIMIT page_limit+1
 ), visible AS (
  SELECT * FROM page ORDER BY date DESC,id DESC LIMIT page_limit
 )
 SELECT jsonb_build_object(
  'balance',(SELECT coalesce(sum(amount),0)::text FROM public.player_transactions WHERE profile_id=p_profile_id),
  'transactions',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',t.id,'profile_id',t.profile_id,'date',t.date,'transaction_type',t.transaction_type,'amount',t.amount::text,
    'notes',t.notes,'created_at',t.created_at,'source_game_id',t.source_game_id,'actor_id',t.actor_id,'reversal_of',t.reversal_of,
    'reversed',EXISTS(SELECT 1 FROM public.player_transactions r WHERE r.reversal_of=t.id)
   ) ORDER BY t.date DESC,t.id DESC) FROM visible t),'[]'::jsonb),
  'has_more',(SELECT count(*)>page_limit FROM page),
  'next_cursor',(SELECT jsonb_build_object('date',date,'id',id) FROM visible ORDER BY date,id LIMIT 1)
 ) INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.account_statement(uuid,integer,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.account_statement(uuid,integer,timestamptz,uuid) TO authenticated;

CREATE FUNCTION public.admin_account_balances() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
  RAISE EXCEPTION 'account_balances:not_authorized' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',account.id,'username',account.username,'balance',account.balance::text,
   'lastTransactionDate',account.last_date) ORDER BY account.balance DESC,account.id),'[]'::jsonb)
 INTO result FROM (
   SELECT p.id,p.username,coalesce(sum(t.amount),0) balance,max(t.date) last_date
   FROM public.profiles p JOIN auth.users a ON a.id=p.id
   LEFT JOIN public.player_transactions t ON t.profile_id=p.id
   WHERE p.is_active GROUP BY p.id,p.username
 ) account;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_account_balances() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_account_balances() TO authenticated;

CREATE OR REPLACE FUNCTION private.reconcile_session_abandonment(p_game_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
  v_authority_keys text[]:=ARRAY['app.three_five_seven_authoritative_write','app.gin_rummy_authoritative_write','app.cribbage_authoritative_write','app.yahtzee_authoritative_write'];
  v_prior_settings text[]:=ARRAY[]::text[];
  v_setting_index integer;
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

    IF v_game.real_money IS DISTINCT FROM false THEN
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        v_prior_settings:=array_append(v_prior_settings,coalesce(current_setting(v_authority_keys[v_setting_index],true),''));
        PERFORM set_config(v_authority_keys[v_setting_index],'on',true);
      END LOOP;
      UPDATE public.games SET status='session_ended',session_ended_at=p_now,game_over_at=coalesce(game_over_at,p_now),
        pending_session_end=false,is_paused=false WHERE id=p_game_id;
      FOR v_setting_index IN 1..cardinality(v_authority_keys) LOOP
        PERFORM set_config(v_authority_keys[v_setting_index],v_prior_settings[v_setting_index],true);
      END LOOP;
      DELETE FROM private.session_abandonment_watches WHERE game_id=p_game_id;
      RETURN 'archived-pristine-real-session';
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
NOTIFY pgrst,'reload schema';
