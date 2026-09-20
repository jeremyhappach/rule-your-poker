BEGIN ISOLATION LEVEL READ COMMITTED;
-- Atomic recovery: exclusive ownership waits for all in-flight creators.
SELECT pg_advisory_xact_lock(19092026,1);
UPDATE private.farkle_release SET creation_enabled=false WHERE singleton;
DO $gate$ BEGIN
 IF EXISTS(SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('ante_decision','in_progress')) THEN RAISE EXCEPTION 'farkle:active_games_require_compatible_recovery'; END IF;
END $gate$;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz)'::regprocedure)) NOT IN ('9fc99d2870622c8bb0aebe5a78e7f00f','3cd85a247c2cbcecf6f64ef05dc74052') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:configure_dealer_game'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.configure_dealer_game(p_game_id uuid, p_dealer_player_id uuid, p_expected_dealer_position integer, p_game_type text, p_config jsonb, p_expected_config_deadline timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_dealer public.players%ROWTYPE;
  v_dealer_game public.dealer_games%ROWTYPE;
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt()->>'role','') = 'service_role';
  v_is_admin boolean := false;
  v_request_hash text;
  v_claim private.dealer_game_setup_commits%ROWTYPE;
  v_config jsonb;
  v_result jsonb;
  v_players jsonb;
  v_ante integer;
  v_rollover integer;
  v_leg integer;
  v_legs integer;
  v_pussy_enabled boolean;
  v_pussy_value integer;
  v_pot_max_enabled boolean;
  v_pot_max_value integer;
  v_chucky integer;
  v_rabbit boolean;
  v_reveal boolean;
  v_points integer;
  v_skunk_enabled boolean;
  v_skunk_threshold integer;
  v_double_skunk_enabled boolean;
  v_double_skunk_threshold integer;
  v_game_mode text;
  v_per_point integer;
  v_gin_bonus integer;
  v_undercut_bonus integer;
  v_ante_deadline timestamptz;
BEGIN
  IF p_game_id IS NULL OR p_dealer_player_id IS NULL OR p_expected_config_deadline IS NULL
     OR p_expected_dealer_position IS NULL OR p_expected_dealer_position NOT BETWEEN 1 AND 7 THEN
    RAISE EXCEPTION 'configure_dealer_game:missing_exact_identity';
  END IF;
  IF p_game_type NOT IN (
    '3-5-7','holm-game','cribbage','gin-rummy',
    'horses','ship-captain-crew','yahtzee'
  ) THEN
    RAISE EXCEPTION 'configure_dealer_game:unsupported_game_type:%',p_game_type;
  END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_config_document';
  END IF;
  IF v_actor IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'configure_dealer_game:authentication_required';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'public.configure_dealer_game',false,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'configure_dealer_game:game_not_found'; END IF;

  v_is_admin := v_actor IS NOT NULL AND public.has_role(v_actor,'admin'::public.app_role);
  IF NOT v_is_service AND NOT v_is_admin AND NOT public.user_is_in_game(p_game_id) THEN
    RAISE EXCEPTION 'configure_dealer_game:not_in_session';
  END IF;

  IF coalesce(p_config->>'ante_amount','') !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_ante';
  END IF;
  v_ante := (p_config->>'ante_amount')::integer;
  v_request_hash := md5(concat_ws('|',
    p_game_id::text,p_dealer_player_id::text,p_expected_dealer_position::text,p_game_type,p_config::text,
    p_expected_config_deadline::text
  ));

  SELECT * INTO v_claim
    FROM private.dealer_game_setup_commits claim
   WHERE claim.game_id=p_game_id
     AND claim.expected_config_deadline=p_expected_config_deadline
     AND claim.expected_dealer_position=p_expected_dealer_position
   FOR UPDATE;
  IF FOUND THEN
    IF v_claim.request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'configure_dealer_game:replay_payload_mismatch';
    END IF;
    v_replay_return := v_claim.result || jsonb_build_object('outcome','already_configured','deduped',true);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  IF coalesce(v_game.is_paused,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:game_paused';
  END IF;
  IF coalesce(v_game.pending_session_end,false) THEN
    RAISE EXCEPTION 'configure_dealer_game:session_ending';
  END IF;
  IF v_game.status NOT IN ('game_selection','configuring') THEN
    RAISE EXCEPTION 'configure_dealer_game:invalid_phase:%',v_game.status;
  END IF;
  IF v_game.config_deadline IS DISTINCT FROM p_expected_config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:setup_identity_mismatch';
  END IF;
  IF v_game.dealer_position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_position_mismatch';
  END IF;
  IF clock_timestamp() > v_game.config_deadline THEN
    RAISE EXCEPTION 'configure_dealer_game:configuration_expired';
  END IF;

  SELECT * INTO v_dealer
    FROM public.players player
   WHERE player.id=p_dealer_player_id AND player.game_id=p_game_id
   FOR UPDATE;
  IF NOT FOUND OR v_dealer.position IS DISTINCT FROM p_expected_dealer_position THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_identity_mismatch';
  END IF;
  IF v_dealer.status IN ('left','eliminated') THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_not_eligible';
  END IF;
  IF NOT v_is_service AND NOT v_is_admin AND NOT v_dealer.is_bot
     AND v_dealer.user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'configure_dealer_game:dealer_authorization_required';
  END IF;

  -- Normalize and validate only the fields owned by the selected game.
  IF p_game_type IN ('3-5-7','holm-game') THEN
    IF coalesce(p_config->>'leg_value','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'legs_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'pussy_tax_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'pot_max_enabled','false') NOT IN ('true','false') THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_config';
    END IF;
    v_leg := (p_config->>'leg_value')::integer;
    v_legs := (p_config->>'legs_to_win')::integer;
    v_pussy_enabled := coalesce((p_config->>'pussy_tax_enabled')::boolean,false);
    v_pot_max_enabled := coalesce((p_config->>'pot_max_enabled')::boolean,false);
    IF coalesce(p_config->>'pussy_tax_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'pot_max_value','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_card_game_amount';
    END IF;
    v_pussy_value := (p_config->>'pussy_tax_value')::integer;
    v_pot_max_value := (p_config->>'pot_max_value')::integer;
    IF (v_pussy_enabled AND v_pussy_value<1) OR (v_pot_max_enabled AND v_pot_max_value<1) THEN
      RAISE EXCEPTION 'configure_dealer_game:enabled_amount_must_be_positive';
    END IF;
    IF p_game_type='3-5-7' THEN
      IF coalesce(p_config->>'rollover_amount','') !~ '^[1-9][0-9]*$'
         OR coalesce(p_config->>'reveal_at_showdown','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_357_config';
      END IF;
      v_rollover := (p_config->>'rollover_amount')::integer;
      v_reveal := coalesce((p_config->>'reveal_at_showdown')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',v_rollover,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',NULL,'rabbit_hunt',NULL,
        'reveal_at_showdown',v_reveal
      );
    ELSE
      IF coalesce(p_config->>'chucky_cards','') !~ '^[0-9]+$'
         OR coalesce(p_config->>'rabbit_hunt','false') NOT IN ('true','false') THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_holm_config';
      END IF;
      v_chucky := (p_config->>'chucky_cards')::integer;
      IF v_chucky NOT BETWEEN 2 AND 7 THEN
        RAISE EXCEPTION 'configure_dealer_game:invalid_chucky_count';
      END IF;
      v_rabbit := coalesce((p_config->>'rabbit_hunt')::boolean,false);
      v_config := jsonb_build_object(
        'ante_amount',v_ante,'rollover_amount',NULL,'leg_value',v_leg,
        'pussy_tax_enabled',v_pussy_enabled,'pussy_tax_value',v_pussy_value,
        'legs_to_win',v_legs,'pot_max_enabled',v_pot_max_enabled,
        'pot_max_value',v_pot_max_value,'chucky_cards',v_chucky,
        'rabbit_hunt',v_rabbit,'reveal_at_showdown',NULL
      );
    END IF;
  ELSIF p_game_type='cribbage' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'double_skunk_enabled','false') NOT IN ('true','false')
       OR coalesce(p_config->>'skunk_threshold','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'double_skunk_threshold','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_skunk_enabled := (p_config->>'skunk_enabled')::boolean;
    v_double_skunk_enabled := (p_config->>'double_skunk_enabled')::boolean;
    v_skunk_threshold := (p_config->>'skunk_threshold')::integer;
    v_double_skunk_threshold := (p_config->>'double_skunk_threshold')::integer;
    v_game_mode := coalesce(p_config->>'game_mode','full');
    IF v_game_mode NOT IN ('full','half','super_quick','sprint','custom')
       OR (v_skunk_enabled AND (v_skunk_threshold<1 OR v_skunk_threshold>=v_points))
       OR (v_double_skunk_enabled AND (v_double_skunk_threshold<1 OR v_double_skunk_threshold>=v_skunk_threshold)) THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_cribbage_thresholds';
    END IF;
    IF NOT v_skunk_enabled THEN
      v_skunk_threshold:=0; v_double_skunk_enabled:=false; v_double_skunk_threshold:=0;
    ELSIF NOT v_double_skunk_enabled THEN
      v_double_skunk_threshold:=0;
    END IF;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'skunk_enabled',v_skunk_enabled,
      'skunk_threshold',v_skunk_threshold,'double_skunk_enabled',v_double_skunk_enabled,
      'double_skunk_threshold',v_double_skunk_threshold,'game_mode',v_game_mode
    );
    IF v_game_mode='custom' THEN
      v_config:=v_config||jsonb_build_object('custom_points_to_win',v_points);
    END IF;
  ELSIF p_game_type='gin-rummy' THEN
    IF coalesce(p_config->>'points_to_win','') !~ '^[1-9][0-9]*$'
       OR coalesce(p_config->>'per_point_value','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'gin_bonus','') !~ '^[0-9]+$'
       OR coalesce(p_config->>'undercut_bonus','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'configure_dealer_game:invalid_gin_config';
    END IF;
    v_points := (p_config->>'points_to_win')::integer;
    v_per_point := (p_config->>'per_point_value')::integer;
    v_gin_bonus := (p_config->>'gin_bonus')::integer;
    v_undercut_bonus := (p_config->>'undercut_bonus')::integer;
    v_config := jsonb_build_object(
      'ante_amount',v_ante,'points_to_win',v_points,'per_point_value',v_per_point,
      'gin_bonus',v_gin_bonus,'undercut_bonus',v_undercut_bonus
    );
  ELSE
    v_config := jsonb_build_object('ante_amount',v_ante);
  END IF;

  INSERT INTO public.dealer_games(session_id,game_type,dealer_user_id,config)
  VALUES(p_game_id,p_game_type,v_dealer.user_id,v_config)
  RETURNING * INTO v_dealer_game;

  -- The authority guards are game-specific. This shared owner deliberately
  -- enters every accepted authority scope so both the outgoing and incoming
  -- game families permit only this transaction to cross their boundary.
  PERFORM set_config('app.cribbage_authoritative_write','on',true);
  PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);

  UPDATE public.players player
     SET current_decision=NULL,
         decision_locked=false,
         auto_fold=false,
         pre_stay=false,
         pre_fold=false,
         ante_decision=CASE WHEN player.id=p_dealer_player_id THEN 'ante_up' ELSE NULL END,
         sitting_out=CASE WHEN player.id=p_dealer_player_id THEN false ELSE player.sitting_out END,
         status=CASE WHEN player.status='folded' THEN 'active' ELSE player.status END
   WHERE player.game_id=p_game_id AND player.status<>'left';

  v_ante_deadline := clock_timestamp()+make_interval(
    secs=>greatest(1,coalesce(v_game.ante_decision_timer_seconds,30))
  );

  UPDATE public.games game
     SET game_type=p_game_type,
         replay_contract_version=CASE WHEN p_game_type='gin-rummy' THEN game.replay_contract_version ELSE NULL END,
         ante_amount=v_ante,
         config_complete=true,
         status='ante_decision',
         ante_decision_deadline=v_ante_deadline,
         config_deadline=NULL,
         current_game_uuid=v_dealer_game.id,
         all_decisions_in=false,
         all_decisions_in_round_id=NULL,
         leg_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_leg ELSE 0 END,
         legs_to_win=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_legs ELSE 0 END,
         pussy_tax_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_enabled ELSE false END,
         pot_max_enabled=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_enabled ELSE false END,
         rollover_amount=CASE WHEN p_game_type='3-5-7' THEN v_rollover WHEN p_game_type='holm-game' THEN 1 ELSE game.rollover_amount END,
         pussy_tax_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax_value END,
         pussy_tax=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pussy_value ELSE game.pussy_tax END,
         pot_max_value=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN v_pot_max_value ELSE game.pot_max_value END,
         chucky_cards=CASE WHEN p_game_type='holm-game' THEN v_chucky ELSE game.chucky_cards END,
         rabbit_hunt=CASE WHEN p_game_type='holm-game' THEN v_rabbit ELSE game.rabbit_hunt END,
         reveal_at_showdown=CASE WHEN p_game_type='3-5-7' THEN v_reveal ELSE game.reveal_at_showdown END,
         points_to_win=CASE WHEN p_game_type IN ('cribbage','gin-rummy') THEN v_points ELSE game.points_to_win END,
         skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_skunk_enabled ELSE game.skunk_enabled END,
         skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_skunk_threshold ELSE game.skunk_threshold END,
         double_skunk_enabled=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_enabled ELSE game.double_skunk_enabled END,
         double_skunk_threshold=CASE WHEN p_game_type='cribbage' THEN v_double_skunk_threshold ELSE game.double_skunk_threshold END,
         pot=CASE WHEN p_game_type='cribbage' THEN 0 ELSE game.pot END,
         dealer_selection_state=CASE WHEN p_game_type='cribbage' THEN NULL ELSE game.dealer_selection_state END,
         is_first_hand=CASE WHEN p_game_type IN ('holm-game','cribbage') THEN true ELSE game.is_first_hand END,
         last_round_result=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.last_round_result END,
         game_over_at=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.game_over_at END,
         current_round=CASE WHEN p_game_type='holm-game' THEN 1 WHEN p_game_type='3-5-7' THEN NULL ELSE game.current_round END,
         awaiting_next_round=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN false ELSE game.awaiting_next_round END,
         next_round_number=CASE WHEN p_game_type IN ('3-5-7','holm-game') THEN NULL ELSE game.next_round_number END
   WHERE game.id=p_game_id
   RETURNING * INTO v_game;

  SELECT coalesce(jsonb_agg(to_jsonb(player) ORDER BY player.position),'[]'::jsonb)
    INTO v_players FROM public.players player WHERE player.game_id=p_game_id;
  v_result := jsonb_build_object(
    'outcome','configured','deduped',false,
    'setup_identity',jsonb_build_object(
      'game_id',p_game_id,'dealer_position',p_expected_dealer_position,
      'expected_config_deadline',p_expected_config_deadline
    ),
    'game',to_jsonb(v_game),'dealer_game',to_jsonb(v_dealer_game),'players',v_players
  );

  INSERT INTO private.dealer_game_setup_commits(
    game_id,expected_config_deadline,expected_dealer_position,
    request_hash,dealer_game_id,result
  ) VALUES(
    p_game_id,p_expected_config_deadline,p_expected_dealer_position,
    v_request_hash,v_dealer_game.id,v_result
  );
  v_replay_return := v_result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_dealer_player_id',p_dealer_player_id,'p_expected_dealer_position',p_expected_dealer_position,'p_game_type',p_game_type,'p_config',p_config,'p_expected_config_deadline',p_expected_config_deadline),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO postgres;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_dealer_game(uuid,uuid,integer,text,jsonb,timestamptz) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.consume_automatic_play_stop()'::regprocedure)) NOT IN ('9a9044ce522cd73b9980f0b7e87f774b','08008547a8c6728231ef68054ced5400') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:consume_automatic_play_stop'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.consume_automatic_play_stop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE g public.games%ROWTYPE; prior text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.players WHERE auto_play_stop_round_id=NEW.id) THEN RETURN NEW; END IF;
 SELECT * INTO g FROM public.games WHERE id=NEW.game_id FOR UPDATE;
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET
 auto_fold=CASE WHEN g.current_game_uuid=NEW.dealer_game_id AND g.current_round=NEW.round_number
 AND g.total_hands=NEW.hand_number THEN false ELSE auto_fold END,
 auto_play_stop_round_id=NULL
 WHERE game_id=NEW.game_id AND auto_play_stop_round_id=NEW.id
 AND (NEW.status='completed' OR NEW.horses_state->>'gamePhase' IS DISTINCT FROM 'playing'
 OR NEW.horses_state->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 RETURN NEW;
END $function$
;
ALTER FUNCTION private.consume_automatic_play_stop() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.consume_automatic_play_stop() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.consume_automatic_play_stop() TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz)'::regprocedure)) NOT IN ('011e5fbde8d7e98badd420ea448c841e','a5244a4d537f034e8a125edf8e27a6eb') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:advance_ante_phase_exact'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_ante_phase_exact(p_game_id uuid, p_expected_dealer_game_id uuid, p_expected_deadline timestamp with time zone, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb;
  v_game public.games%ROWTYPE;
  v_unresolved integer;
  v_anted integer;
  v_outcome text;
  v_start jsonb;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF v_game.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(v_game,'private.advance_ante_phase_exact',false,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now)); END IF;
  PERFORM 1; -- Preserve the original missing-row guard.
 END IF;
  IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
  IF v_game.status IS DISTINCT FROM 'ante_decision'
     OR v_game.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id
     OR v_game.ante_decision_deadline IS DISTINCT FROM p_expected_deadline THEN
    v_replay_return := jsonb_build_object('outcome','stale_identity','status',v_game.status);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    v_replay_return := jsonb_build_object('outcome','paused');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET ante_decision='ante_up',sitting_out=false
   WHERE player.game_id=p_game_id
     AND coalesce(player.is_bot,false)
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.ante_decision IS NULL;

  UPDATE public.players player
     SET sitting_out=true,waiting=false
   WHERE player.game_id=p_game_id
     AND player.ante_decision='sit_out'
     AND NOT coalesce(player.sitting_out,false);

  IF p_expected_deadline<=p_now THEN
    UPDATE public.players player
       SET ante_decision='sit_out',sitting_out=true,waiting=false
     WHERE player.game_id=p_game_id
       AND NOT coalesce(player.is_bot,false)
       AND NOT coalesce(player.sitting_out,false)
       AND player.status NOT IN ('observer','left')
       AND player.ante_decision IS NULL;
  END IF;

  SELECT count(*) INTO v_unresolved
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision IS NULL;
  IF v_unresolved>0 THEN
    v_replay_return := jsonb_build_object(
      'outcome','pending','unresolved',v_unresolved,
      'deadline',p_expected_deadline
    );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  UPDATE public.players player
     SET sitting_out_hands=CASE
           WHEN coalesce(player.sitting_out,false)
             THEN coalesce(player.sitting_out_hands,0)+1
           ELSE 0 END
   WHERE player.game_id=p_game_id
     AND player.status NOT IN ('observer','left');

  SELECT count(*) INTO v_anted
    FROM public.players player
   WHERE player.game_id=p_game_id
     AND NOT coalesce(player.sitting_out,false)
     AND player.status NOT IN ('observer','left')
     AND player.position IS NOT NULL
     AND player.ante_decision='ante_up';

  -- Both the not-enough-players disposition and normal game bootstrap are
  -- private database-owned transitions. Establish the existing trusted local
  -- claim before either branch so a fresh authenticated HTTP request does not
  -- depend on dealer setup's expired transaction-local authority flags.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  IF v_anted<2 THEN
    IF coalesce(v_game.real_money,false) THEN
      v_outcome:=private.resolve_postgame_participation(p_game_id,p_now);
    ELSE
      UPDATE public.games
         SET status='waiting',current_game_uuid=NULL,config_complete=false,
             config_deadline=NULL,ante_decision_deadline=NULL,
             awaiting_next_round=false,last_round_result=NULL
       WHERE id=p_game_id;
      v_outcome:='waiting-not-enough-players';
    END IF;
    v_replay_return := jsonb_build_object('outcome','not_enough_players','reason',v_outcome);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
  END IF;

  CASE
    WHEN v_game.game_type IN ('3-5-7','3-5-7-game','357') THEN
      SELECT public.three_five_seven_begin_game(p_game_id) INTO v_start;
    WHEN v_game.game_type IN ('holm','holm-game') THEN
      SELECT public.start_holm_initial_hand(p_game_id,false) INTO v_start;
    WHEN v_game.game_type='cribbage' THEN
      SELECT public.cribbage_begin_dealer_selection(p_game_id) INTO v_start;
    WHEN v_game.game_type='gin-rummy' THEN
      SELECT public.start_gin_rummy_initial_hand(p_game_id) INTO v_start;
    WHEN v_game.game_type='yahtzee' THEN
      SELECT public.start_yahtzee_round(p_game_id,NULL) INTO v_start;
    WHEN v_game.game_type IN ('horses','ship-captain-crew') THEN
      SELECT private.start_horses_scc_initial_round(
        p_game_id,p_expected_dealer_game_id
      ) INTO v_start;
    ELSE
      RAISE EXCEPTION 'advance_ante_phase_exact:unsupported_game_type:%',v_game.game_type;
  END CASE;

  v_replay_return := jsonb_build_object(
    'outcome','advanced','game_type',v_game.game_type,'start',v_start
  );
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_deadline',p_expected_deadline,'p_now',p_now),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END;
$function$
;
ALTER FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_ante_phase_exact(uuid,uuid,timestamptz,timestamptz) TO postgres;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.read_session_frame(uuid)'::regprocedure)) NOT IN ('78597533f2f3e4870b47d1c5b1e5fbd9','6a65b8a32ff86b01f9cc420a83e069a8') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:read_session_frame'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.read_session_frame(p_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_frame:authentication_required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'game',to_jsonb(g)||jsonb_build_object('_authorityRevision',private.session_authority_revision(g.id),
    'rounds',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object(
       'horses_state',CASE WHEN r.horses_state IS NULL THEN NULL ELSE r.horses_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END,
       'yahtzee_state',CASE WHEN r.yahtzee_state IS NULL THEN NULL ELSE r.yahtzee_state||jsonb_build_object('_authorityRevision',r.authority_revision,'_authorityScope',r.id) END)
     ORDER BY r.hand_number,r.round_number,r.id) FROM public.rounds r WHERE r.game_id=g.id),'[]'::jsonb)),
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('profiles',
    CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object('username',pr.username,'aggression_level',pr.aggression_level) END)
    ORDER BY p.position,p.id) FROM public.players p LEFT JOIN public.profiles pr ON pr.id=p.user_id
    WHERE p.game_id=g.id AND p.status<>'left'),'[]'::jsonb),
  'allow_bot_dealers',(SELECT allow_bot_dealers FROM public.game_defaults WHERE game_type='holm' LIMIT 1),
  'server_now',statement_timestamp()
 ) INTO result FROM public.games g WHERE g.id=p_game_id;
 RETURN result;
END $function$
;
ALTER FUNCTION public.read_session_frame(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_session_frame(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.read_session_frame(uuid) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('private.advance_due_canonical_game_timers(integer)'::regprocedure)) NOT IN ('edd034879df909e97dca92c715a4ab3a','e7c784e3fa2e412d3333ffd2355096f4') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:advance_due_canonical_game_timers'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION private.advance_due_canonical_game_timers(p_limit integer DEFAULT 64)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_saved_recovery_context jsonb:=private.capture_recovery_context();
  v_timer private.game_timer_registry%ROWTYPE;
  v_legacy record;
  v_result jsonb;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_decision text;
  v_fold_probability numeric;
  v_processed integer:=0;
  v_failed integer:=0;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  FOR v_timer IN
    SELECT timer.*
      FROM private.game_timer_registry timer
      JOIN public.games game_row ON game_row.id=timer.game_id
     WHERE timer.owner_task='canonical_timers'
       AND timer.state='scheduled'
       AND timer.due_at<=clock_timestamp()
       AND NOT coalesce(game_row.is_paused,false)
     ORDER BY timer.due_at,timer.id
     LIMIT greatest(1,least(coalesce(p_limit,64),256))
     FOR UPDATE OF timer SKIP LOCKED
  LOOP
    UPDATE private.game_timer_registry
       SET state='processing',attempt_count=attempt_count+1,
           last_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
     WHERE id=v_timer.id;
    BEGIN
      v_result:=NULL;
      CASE v_timer.timer_kind
        WHEN 'dealer_selection_prepare' THEN
          v_result:=private.prepare_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'dealer_selection_complete' THEN
          v_result:=private.complete_session_dealer_selection(
            v_timer.game_id,(v_timer.metadata->>'timer_generation')::bigint
          );
        WHEN 'config_timeout' THEN
          v_result:=private.handle_config_deadline_timeout_exact(
            v_timer.game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            (v_timer.metadata->>'expected_dealer_position')::integer
          );
        WHEN 'ante_phase' THEN
          v_result:=private.advance_ante_phase_exact(
            v_timer.game_id,v_timer.dealer_game_id,
            (v_timer.metadata->>'expected_deadline')::timestamptz,
            clock_timestamp()
          );
        WHEN 'holm_decision' THEN
          SELECT * INTO v_player FROM public.players
           WHERE id=v_timer.actor_player_id;
          IF NOT FOUND THEN
            v_result:=jsonb_build_object('outcome','stale_actor');
          ELSE
            IF coalesce(v_player.is_bot,false) THEN
              SELECT coalesce(defaults.bot_fold_probability,30)
                INTO v_fold_probability FROM public.game_defaults defaults
               WHERE defaults.game_type='holm' LIMIT 1;
              v_decision:=CASE WHEN private.secure_random_unit()*100<coalesce(v_fold_probability,30)
                               THEN 'fold' ELSE 'stay' END;
            ELSE
              v_decision:='fold';
            END IF;
            SELECT public.holm_apply_deadline_decision(
              v_timer.game_id,v_timer.round_id,v_player.id,v_decision,
              NOT coalesce(v_player.is_bot,false)
            ) INTO v_result;
          END IF;
        WHEN 'horses_scc_turn' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
        WHEN 'horses_scc_terminal' THEN
          v_result:=private.advance_horses_scc_expired_turn(
            v_timer.round_id,clock_timestamp()
          );
          IF v_result->>'status'='tie_waiting_for_client' THEN
            v_result:=private.horses_scc_rollover_abandoned_round(
              v_timer.round_id,clock_timestamp()
            );
          END IF;
        WHEN 'standard_postgame' THEN
          v_result:=private.advance_standard_postgame(
            v_timer.game_id,v_timer.dealer_game_id,v_timer.hand_number
          );
        ELSE
          RAISE EXCEPTION 'advance_due_canonical_game_timers:unknown_kind:%',
            v_timer.timer_kind;
      END CASE;

      IF v_result->>'outcome' IN ('pending','paused','not_prepared','no_eligible_players','deadline_not_expired') THEN
        SELECT * INTO v_game FROM public.games WHERE id=v_timer.game_id;
        UPDATE private.game_timer_registry
           SET state='scheduled',
               due_at=CASE WHEN v_result->>'outcome' IN ('pending','deadline_not_expired')
                 AND v_result->>'deadline' IS NOT NULL
                 THEN (v_result->>'deadline')::timestamptz
                 ELSE clock_timestamp()+interval '1 second' END,
               metadata=CASE WHEN v_timer.timer_kind='ante_phase'
                 AND v_game.ante_decision_deadline IS NOT NULL
                 THEN metadata || jsonb_build_object(
                   'expected_deadline',v_game.ante_decision_deadline
                 ) ELSE metadata END,
               updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      ELSE
        UPDATE private.game_timer_registry
           SET state='completed',completed_at=clock_timestamp(),
               metadata=metadata || jsonb_build_object(
                 'result',coalesce(v_result,'{}'::jsonb)
               ),updated_at=clock_timestamp()
         WHERE id=v_timer.id;
      END IF;
      v_processed:=v_processed+1;
    EXCEPTION WHEN OTHERS THEN
      v_error:=SQLSTATE || ':' || SQLERRM;
      UPDATE private.game_timer_registry
         SET state='scheduled',due_at=clock_timestamp()+interval '5 seconds',
             last_error=v_error,updated_at=clock_timestamp()
       WHERE id=v_timer.id;
      v_failed:=v_failed+1;
    END;
  END LOOP;

  -- Client-created legacy dice rounds used NULL as a bot-delay sentinel.
  -- Convert only the exact active post-cutover actor to a database timestamp;
  -- no historical row is scanned or admitted.
  FOR v_legacy IN
    SELECT round_row.id,round_row.game_id,defaults.bot_decision_delay_seconds
    FROM public.rounds round_row CROSS JOIN public.games game_row
    JOIN public.game_defaults defaults
      ON defaults.game_type=game_row.game_type
    JOIN public.players actor
      ON actor.game_id=game_row.id AND actor.is_bot=true
   WHERE round_row.game_id=game_row.id
     AND game_row.game_type IN ('horses','ship-captain-crew')
     AND game_row.status='in_progress'
     AND NOT coalesce(game_row.is_paused,false)
     AND game_row.current_game_uuid IS NOT DISTINCT FROM round_row.dealer_game_id
     AND round_row.horses_state->>'gamePhase'='playing'
     AND nullif(round_row.horses_state->>'turnDeadline','') IS NULL
     AND actor.id::text=round_row.horses_state->>'currentTurnPlayerId'
     AND EXISTS (
       SELECT 1 FROM private.game_timer_cutover cutover
        WHERE cutover.singleton=true
          AND game_row.timer_generation>0
     )
     AND NOT private.recovery_session_deferred('canonical_timers',game_row.id)
     ORDER BY round_row.id LIMIT 64
  LOOP
    BEGIN
      UPDATE public.rounds SET horses_state=jsonb_set(horses_state,'{turnDeadline}',to_jsonb(
        clock_timestamp()+make_interval(secs=>greatest(0.1,coalesce(v_legacy.bot_decision_delay_seconds,2)))),true)
      WHERE id=v_legacy.id;
      PERFORM private.clear_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text);
    EXCEPTION WHEN OTHERS THEN
      PERFORM private.record_recovery_unit_failure('canonical_timers',v_legacy.game_id,'legacy:'||v_legacy.id::text,SQLSTATE,SQLERRM);
    END;
  END LOOP;

  PERFORM private.restore_recovery_context(v_saved_recovery_context);

  RETURN jsonb_build_object(
    'outcome',CASE WHEN v_failed=0 THEN 'completed' ELSE 'partial_failure' END,
    'processed',v_processed,'failed',v_failed
  );
EXCEPTION WHEN OTHERS THEN
 PERFORM private.restore_recovery_context(v_saved_recovery_context);
 RAISE;
END;
$function$
;
ALTER FUNCTION private.advance_due_canonical_game_timers(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.advance_due_canonical_game_timers(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO postgres;
GRANT EXECUTE ON FUNCTION private.advance_due_canonical_game_timers(integer) TO service_role;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure)) NOT IN ('aae98932bd835c45f9d3761c912266bd','340cd2c6b16f12770242f39ebf53b6ff') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:set_automatic_play'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_automatic_play(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_player_id uuid, p_expected_version bigint, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; r public.rounds%ROWTYPE; g public.games%ROWTYPE; p public.players%ROWTYPE; deferred boolean; prior text;
BEGIN
 IF auth.uid() IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'automatic_play:invalid_request' USING ERRCODE='22023'; END IF;
 -- Match the dice action owner's round -> session -> participant lock order.
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id AND game_id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_automatic_play',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=g.id FOR UPDATE;
 IF NOT FOUND OR p.user_id IS DISTINCT FROM auth.uid() OR p.is_bot
 THEN RAISE EXCEPTION 'automatic_play:not_authorized' USING ERRCODE='42501'; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR r.dealer_game_id IS DISTINCT FROM p_dealer_game_id
 OR g.current_round IS DISTINCT FROM r.round_number OR g.total_hands IS DISTINCT FROM r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR p.status IN ('left','observer') OR p.position IS NULL
 OR p.intent_version IS DISTINCT FROM p_expected_version
 THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 deferred:=NOT p_enabled AND coalesce(p.auto_fold,false) AND g.game_type IN ('horses','ship-captain-crew')
 AND r.horses_state->>'currentTurnPlayerId'=p.id::text AND r.horses_state->>'gamePhase'='playing';
 prior:=coalesce(current_setting('app.three_five_seven_authoritative_write',true),'');
 PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
 UPDATE public.players SET auto_fold=CASE WHEN coalesce(deferred,false) THEN true ELSE p_enabled END,
 auto_play_stop_round_id=CASE WHEN coalesce(deferred,false) THEN r.id ELSE NULL END,
 sit_out_next_hand=CASE WHEN NOT p_enabled THEN false ELSE sit_out_next_hand END,
 stand_up_next_hand=CASE WHEN NOT p_enabled THEN false ELSE stand_up_next_hand END
 WHERE id=p.id RETURNING * INTO p;
 PERFORM set_config('app.three_five_seven_authoritative_write',prior,true);
 v_replay_return := jsonb_build_object('outcome','accepted','deferred',coalesce(deferred,false),'player',to_jsonb(p));
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_round_id',p_round_id,'p_dealer_game_id',p_dealer_game_id,'p_player_id',p_player_id,'p_expected_version',p_expected_version,'p_enabled',p_enabled),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_automatic_play(uuid,uuid,uuid,uuid,bigint,boolean) TO authenticated;
DO $guard$ BEGIN IF md5(pg_get_functiondef('public.set_game_paused(uuid,boolean,uuid,bigint)'::regprocedure)) NOT IN ('7a8472b77a2805bf1d6e562b3166cfb7','ae070b19f465ca8c16c8700e48f7af34') THEN RAISE EXCEPTION 'farkle:recovery_definition_drift:set_game_paused'; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF FOUND THEN
  IF g.replay_contract_version=1 THEN v_replay_shared:=private.replay_gin_lifecycle_begin_v2(g,'public.set_game_paused',true); END IF;
  PERFORM 1; -- Preserve the preceding SELECT's FOUND value for its original guard.
 END IF;
 IF NOT FOUND THEN v_replay_return := jsonb_build_object('outcome','missing_game');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return; END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  UPDATE public.games SET is_paused=true,timer_paused_at=now_at,paused_time_remaining=remaining WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','paused','is_paused',true,'paused_at',now_at,'remaining_seconds',remaining,'pause_version',g.pause_version);
 ELSE
  IF g.timer_paused_at IS NULL THEN RAISE EXCEPTION 'set_game_paused:missing_pause_identity'; END IF;
  duration:=greatest(interval '0 seconds',now_at-g.timer_paused_at);
  UPDATE public.games SET config_deadline=config_deadline+duration,ante_decision_deadline=ante_decision_deadline+duration,
   game_over_at=CASE WHEN status='game_over' THEN game_over_at+duration ELSE game_over_at END,
   dealer_selection_state=CASE WHEN status='cribbage_dealer_selection'
    THEN private.shift_pause_timestamp(dealer_selection_state,ARRAY['preparedAt'],duration) ELSE dealer_selection_state END
  WHERE id=g.id;
  UPDATE public.rounds SET decision_deadline=decision_deadline+duration,presentation_fallback_at=presentation_fallback_at+duration,
   horses_state=private.shift_pause_timestamp(horses_state,ARRAY['turnDeadline'],duration),
   yahtzee_state=private.shift_pause_timestamp(yahtzee_state,ARRAY['turnDeadline'],duration)
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid
   AND (status<>'completed' OR presentation_fallback_at IS NOT NULL);
  UPDATE private.three_five_seven_round_resolutions SET presentation_fallback_at=presentation_fallback_at+duration
  WHERE game_id=g.id AND dealer_game_id IS NOT DISTINCT FROM g.current_game_uuid AND presentation_fallback_at IS NOT NULL;
  FOR state_row IN SELECT a.* FROM private.gin_rummy_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['scoringDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['completeDueAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['botActionDueAt'],duration);
   UPDATE private.gin_rummy_round_states SET state=shifted,version=version+1,updated_at=state_row.updated_at+duration WHERE round_id=state_row.round_id;
   UPDATE public.rounds SET gin_rummy_state=private.gin_public_state(shifted) WHERE id=state_row.round_id;
  END LOOP;
  FOR state_row IN SELECT a.* FROM private.cribbage_round_states a JOIN public.rounds r ON r.id=a.round_id
   WHERE r.game_id=g.id AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands LOOP
   shifted:=private.shift_pause_timestamp(state_row.state,ARRAY['countingResolution','presentationReleaseAt'],duration);
   shifted:=private.shift_pause_timestamp(shifted,ARRAY['countingResolution','presentationFallbackAt'],duration);
   IF shifted IS DISTINCT FROM state_row.state THEN
    UPDATE private.cribbage_round_states SET state=shifted,version=version+1 WHERE round_id=state_row.round_id;
    UPDATE public.rounds SET cribbage_state=private.cribbage_public_state(shifted) WHERE id=state_row.round_id;
   END IF;
  END LOOP;
  -- These dealer-draw timers have no separate source deadline column.
  UPDATE private.game_timer_registry SET due_at=due_at+duration,updated_at=now_at WHERE game_id=g.id AND state='scheduled'
   AND timer_kind IN ('dealer_selection_prepare','dealer_selection_complete');
  UPDATE public.games SET is_paused=false,timer_paused_at=NULL,paused_time_remaining=NULL WHERE id=g.id RETURNING pause_version INTO g.pause_version;
  result:=jsonb_build_object('outcome','resumed','is_paused',false,'paused_duration_seconds',extract(epoch FROM duration),'pause_version',g.pause_version);
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 v_replay_return := result;
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 RETURN v_replay_return;
END $function$
;
ALTER FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO postgres;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;

COMMIT;
