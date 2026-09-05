-- One pause contract for every rule engine, including service recovery.
CREATE OR REPLACE FUNCTION private.advance_due_three_five_seven_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_game record; v_result jsonb; v_results jsonb:='[]'::jsonb; v_scope uuid;
BEGIN
  PERFORM set_config('app.three_five_seven_recovery','on',true);
  BEGIN
    v_scope:=nullif(current_setting('app.three_five_seven_recovery_game_id',true),'')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'advance_due_three_five_seven_state:invalid_recovery_scope';
  END;
  FOR v_game IN SELECT id FROM public.games
    WHERE game_type IN ('3-5-7','3-5-7-game','357')
      AND status IN ('ante_decision','in_progress','game_over','session_ended')
      AND NOT coalesce(is_paused,false)
      AND (v_scope IS NULL OR id=v_scope)
    ORDER BY id
  LOOP
    v_result:=private.three_five_seven_recover_game(v_game.id);
    v_results:=v_results||jsonb_build_array(jsonb_build_object('game_id',v_game.id,'result',v_result));
  END LOOP;
  RETURN jsonb_build_object('outcome','recovered','games',v_results);
END;
$function$;
CREATE OR REPLACE FUNCTION private.advance_due_gin_rummy_state()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_due record;
  v_count integer := 0;
  v_player uuid;
BEGIN
  FOR v_due IN
    SELECT authority.round_id,authority.state,authority.updated_at,round_row.game_id,
           round_row.dealer_game_id,round_row.hand_number
      FROM private.gin_rummy_round_states authority
      JOIN public.rounds round_row ON round_row.id=authority.round_id
      JOIN public.games game_row ON game_row.id=round_row.game_id
     WHERE game_row.game_type='gin-rummy' AND game_row.status='in_progress' AND NOT coalesce(game_row.is_paused,false)
       AND game_row.current_game_uuid=round_row.dealer_game_id
       AND game_row.total_hands=round_row.hand_number
       AND (
         (authority.state->>'phase'='scoring' AND coalesce((authority.state->>'scoringDueAt')::timestamptz,authority.updated_at+interval '4 seconds')<=clock_timestamp())
         OR (authority.state->>'phase'='complete' AND coalesce((authority.state->>'completeDueAt')::timestamptz,authority.updated_at+interval '5 seconds')<=clock_timestamp())
         OR (
           authority.state->>'phase' IN ('first_draw','playing','knocking','laying_off')
           AND coalesce((authority.state->>'botActionDueAt')::timestamptz,authority.updated_at+interval '1 second')<=clock_timestamp()
           AND EXISTS(SELECT 1 FROM public.players p WHERE p.id=nullif(authority.state->>'currentTurnPlayerId','')::uuid AND p.is_bot)
         )
       )
     ORDER BY authority.updated_at,authority.round_id
     LIMIT 50
  LOOP
    IF v_due.state->>'phase'='scoring' THEN
      v_player:=(v_due.state->>'currentTurnPlayerId')::uuid;
      PERFORM private.gin_apply_action_core(v_due.round_id,v_player,'finalize_scoring',NULL,NULL,coalesce((v_due.state->>'actionCount')::bigint,0));
    ELSIF v_due.state->>'phase'='complete' THEN
      IF nullif(v_due.state->>'winnerPlayerId','') IS NULL THEN
        PERFORM private.gin_start_next_hand_core(v_due.round_id);
      ELSE
        PERFORM set_config('app.gin_rummy_authoritative_write','on',true);
        PERFORM public.gin_rummy_settle_game(v_due.game_id,v_due.round_id,v_due.dealer_game_id,v_due.hand_number);
      END IF;
    ELSE
      PERFORM private.gin_apply_bot_action(v_due.round_id);
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION private.request_session_end(p_game_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; ctx text; prior jsonb:='{}'; target text; terminal_key text; settled boolean:=false; result jsonb;
BEGIN
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','deleted','already_terminal',true); END IF;
 IF g.status IN ('session_ended','completed') THEN
 RETURN jsonb_build_object('request_recorded',true,'terminal_disposition','session_ended','already_terminal',true); END IF;
 IF g.status='game_over' THEN
  terminal_key:=CASE g.game_type WHEN '3-5-7' THEN 'three_five_seven_terminal' WHEN '3-5-7-game' THEN 'three_five_seven_terminal'
   WHEN '357' THEN 'three_five_seven_terminal' WHEN 'horses' THEN 'horses_terminal' WHEN 'ship-captain-crew' THEN 'horses_terminal'
   WHEN 'cribbage' THEN 'cribbage_terminal' WHEN 'gin-rummy' THEN 'gin_rummy_terminal' WHEN 'yahtzee' THEN 'yahtzee_terminal' END;
  SELECT coalesce(g.pot,0)=0 AND EXISTS(SELECT 1 FROM public.game_results r WHERE r.game_id=g.id
   AND r.dealer_game_id=g.current_game_uuid AND r.hand_number=g.total_hands
   AND ((g.game_type IN ('holm','holm-game') AND r.event_kind='chucky_final_award') OR r.settlement_key=terminal_key))
   INTO settled;
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF (g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0 AND g.status IN ('waiting','dealer_selection','game_selection','configuring')) OR settled THEN
  IF g.real_money IS FALSE AND g.current_game_uuid IS NULL AND coalesce(g.pot,0)=0
   AND NOT EXISTS(SELECT 1 FROM public.rounds WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.game_results WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND chips<>0)
   AND NOT EXISTS(SELECT 1 FROM public.session_player_snapshots WHERE game_id=g.id)
   AND NOT EXISTS(SELECT 1 FROM public.player_transactions WHERE source_game_id=g.id) THEN
   DELETE FROM public.games WHERE id=g.id; target:='deleted';
  ELSE
   UPDATE public.games SET status='session_ended',session_ended_at=coalesce(session_ended_at,clock_timestamp()),
    pending_session_end=false,config_deadline=NULL,ante_decision_deadline=NULL
   WHERE id=g.id;
   target:='session_ended';
  END IF;
 ELSE
  -- Rule engines consume the request at their financial completion boundary.
  UPDATE public.games SET pending_session_end=true WHERE id=g.id;
  target:='pending_session_end';
 END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  PERFORM set_config(ctx,prior->>ctx,true); END LOOP;
 RETURN jsonb_build_object('request_recorded',true,'terminal_disposition',target,'already_terminal',false);
END $$;
-- Trusted legacy timeout caller forwards to the same complete envelope.
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid,p_paused boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'set_game_paused:version_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.games WHERE id=p_game_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
 RETURN public.set_game_paused(g.id,p_paused,g.current_game_uuid,g.pause_version);
END $$;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.pause_due_real_money_yahtzee_turn(p_round_id uuid, p_player_id uuid, p_expected_action_sequence integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_sequence integer;
  v_deadline timestamptz;
  v_reset_deadline timestamptz;
  v_pause jsonb;
  prior_yahtzee text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'pause_due_real_money_yahtzee_turn:service_role_required';
  END IF;

  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_round'); END IF;
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'yahtzee' THEN
    RETURN jsonb_build_object('outcome','not_yahtzee');
  END IF;
  IF NOT coalesce(v_game.real_money,false) THEN
    RETURN jsonb_build_object('outcome','not_real_money');
  END IF;
  IF coalesce(v_game.is_paused,false) THEN
    RETURN jsonb_build_object('outcome','already_paused','deduped',true);
  END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number
     OR v_round.status IS DISTINCT FROM 'betting' THEN
    RETURN jsonb_build_object('outcome','rejected','reason','round_not_current');
  END IF;

  v_state:=v_round.yahtzee_state;
  IF v_state->>'gamePhase' IS DISTINCT FROM 'playing'
     OR nullif(v_state->>'currentTurnPlayerId','')::uuid IS DISTINCT FROM p_player_id THEN
    RETURN jsonb_build_object('outcome','stale_turn','deduped',true);
  END IF;
  BEGIN
    v_sequence:=coalesce((v_state->>'actionSequence')::integer,0);
    v_deadline:=nullif(v_state->>'turnDeadline','')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('outcome','rejected','reason','invalid_turn_identity');
  END;
  IF v_sequence IS DISTINCT FROM p_expected_action_sequence THEN
    RETURN jsonb_build_object('outcome','stale_action','deduped',true,'action_sequence',v_sequence);
  END IF;
  IF v_deadline IS NULL OR v_round.decision_deadline IS DISTINCT FROM v_deadline THEN
    RETURN jsonb_build_object('outcome','rejected','reason','deadline_identity_changed');
  END IF;
  IF v_deadline > clock_timestamp() THEN
    RETURN jsonb_build_object('outcome','rejected','reason','deadline_not_due');
  END IF;

  -- A preserved expired deadline would immediately re-pause on resume. Reset
  -- it first; public.set_game_paused shifts this fresh deadline on resume.
  v_reset_deadline:=private.yahtzee_turn_deadline(v_game.id,p_player_id);
  v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_reset_deadline),true);
  prior_yahtzee:=coalesce(current_setting('app.yahtzee_authoritative_write',true),'');
  PERFORM set_config('app.yahtzee_authoritative_write','on',true);
  UPDATE public.rounds
     SET yahtzee_state=v_state,decision_deadline=v_reset_deadline
   WHERE id=v_round.id;

  v_pause:=public.set_game_paused(v_game.id,true);
  IF v_pause->>'outcome' NOT IN ('paused','already_set') THEN
    RAISE EXCEPTION 'pause_due_real_money_yahtzee_turn:pause_failed:%',v_pause;
  END IF;
  PERFORM set_config('app.yahtzee_authoritative_write',prior_yahtzee,true);
  RETURN v_pause || jsonb_build_object(
    'reason','real_money_yahtzee_timeout',
    'round_id',v_round.id,
    'player_id',p_player_id,
    'action_sequence',v_sequence,
    'reset_deadline',v_reset_deadline
  );
END;
$function$;
ALTER TABLE public.games ADD COLUMN pause_version bigint NOT NULL DEFAULT 0;
CREATE FUNCTION private.stamp_pause_version() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.pause_version:=CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.pause_version+
 CASE WHEN OLD.is_paused IS DISTINCT FROM NEW.is_paused THEN 1 ELSE 0 END END; RETURN NEW; END $$;
CREATE TRIGGER stamp_pause_version BEFORE INSERT OR UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION private.stamp_pause_version();

CREATE FUNCTION private.assert_game_not_paused(p_game_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE paused boolean;
BEGIN
 SELECT is_paused INTO paused FROM public.games WHERE id=p_game_id FOR UPDATE;
 IF coalesce(paused,false) THEN RAISE EXCEPTION 'game_paused' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.assert_game_not_paused(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.guard_paused_gameplay() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mutable_controls text[]:=ARRAY['is_paused','pause_version','timer_paused_at','paused_time_remaining',
 'pending_session_end','current_host','host_version','session_ended_at','status','updated_at'];
BEGIN
 IF coalesce(current_setting('app.session_pause_write',true),'')='on' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='games' THEN
  IF OLD.is_paused AND ((to_jsonb(OLD)-mutable_controls) IS DISTINCT FROM (to_jsonb(NEW)-mutable_controls)
   OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status<>'session_ended')) THEN
   RAISE EXCEPTION 'game_paused' USING ERRCODE='55000'; END IF;
 ELSIF TG_TABLE_NAME='players' THEN
  IF ROW(OLD.chips,OLD.legs,OLD.current_decision,OLD.decision_locked,OLD.pre_fold,OLD.pre_stay,OLD.chip_transfer_cursor)
   IS DISTINCT FROM ROW(NEW.chips,NEW.legs,NEW.current_decision,NEW.decision_locked,NEW.pre_fold,NEW.pre_stay,NEW.chip_transfer_cursor)
  THEN PERFORM private.assert_game_not_paused(NEW.game_id); END IF;
 ELSE PERFORM private.assert_game_not_paused(NEW.game_id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_paused_gameplay() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_paused_gameplay BEFORE UPDATE ON public.games FOR EACH ROW EXECUTE FUNCTION private.guard_paused_gameplay();
CREATE TRIGGER guard_paused_gameplay BEFORE UPDATE ON public.players FOR EACH ROW EXECUTE FUNCTION private.guard_paused_gameplay();
CREATE TRIGGER guard_paused_gameplay BEFORE INSERT OR UPDATE ON public.rounds FOR EACH ROW EXECUTE FUNCTION private.guard_paused_gameplay();

CREATE FUNCTION private.shift_pause_timestamp(p_state jsonb,p_path text[],p_duration interval) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN nullif(p_state#>>p_path,'') IS NULL THEN p_state
 ELSE jsonb_set(p_state,p_path,to_jsonb((p_state#>>p_path)::timestamptz+p_duration),false) END
$$;
REVOKE ALL ON FUNCTION private.shift_pause_timestamp(jsonb,text[],interval) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.set_game_paused(p_game_id uuid,p_paused boolean,p_expected_dealer_game_id uuid,p_expected_pause_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 IF p_paused IS NULL OR p_expected_pause_version IS NULL THEN RAISE EXCEPTION 'set_game_paused:invalid_request' USING ERRCODE='22023'; END IF;
 -- Taking current round locks first matches the active action owners. NOWAIT
 -- rejects a competing transition for retry instead of creating a lock cycle.
 PERFORM 1 FROM public.rounds WHERE game_id=p_game_id AND dealer_game_id IS NOT DISTINCT FROM p_expected_dealer_game_id
 ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN jsonb_build_object('outcome','missing_game'); END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN RETURN jsonb_build_object('outcome','not_authorized'); END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR g.status IN ('session_ended','completed') THEN RETURN jsonb_build_object('outcome','stale_identity'); END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN RETURN jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version); END IF;
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
 RETURN result;
EXCEPTION WHEN lock_not_available THEN RETURN jsonb_build_object('outcome','busy');
END $$;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.gin_apply_action_core(_round_id uuid, _player_id uuid, _action text, _card jsonb, _meld_index integer, _expected_action_count bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_state jsonb;
  v_hand jsonb;
  v_actual_card jsonb;
  v_top jsonb;
  v_opponent text;
  v_knocker text;
  v_group jsonb;
  v_opponent_group jsonb;
  v_target_meld jsonb;
  v_melds jsonb;
  v_new_meld jsonb;
  v_count bigint;
  v_phase text;
  v_now text := to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gin_rummy_apply_action:round_not_found'; END IF;
  PERFORM private.assert_game_not_paused(v_round.game_id);
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF NOT FOUND OR v_game.game_type IS DISTINCT FROM 'gin-rummy' THEN RAISE EXCEPTION 'gin_rummy_apply_action:not_gin_game'; END IF;
  IF v_game.status IS DISTINCT FROM 'in_progress'
     OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id
     OR v_game.total_hands IS DISTINCT FROM v_round.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity','state',NULL);
  END IF;
  SELECT state INTO v_state FROM private.gin_rummy_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:state_not_found'; END IF;
  IF NOT (v_state->'playerStates' ? _player_id::text) THEN RAISE EXCEPTION 'gin_rummy_apply_action:player_not_in_round'; END IF;
  v_count := coalesce((v_state->>'actionCount')::bigint,0);
  IF _expected_action_count IS NOT NULL AND _expected_action_count IS DISTINCT FROM v_count THEN
    RETURN jsonb_build_object('outcome','stale_action','state',v_state);
  END IF;

  IF _action='take_first_draw' THEN
    IF v_state->>'phase'<>'first_draw' OR v_state->>'firstDrawOfferedTo'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_first_draw_take'; END IF;
    v_top := v_state->'discardPile'->(jsonb_array_length(v_state->'discardPile')-1);
    IF v_top IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:discard_empty'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand' || jsonb_build_array(v_top);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{discardPile}',private.gin_array_pop(v_state->'discardPile'),true);
    v_state := jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(_player_id::text),true);
    v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{drawSource}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{firstDrawOfferedTo}','null'::jsonb,true);
    v_state := jsonb_set(v_state,'{firstDrawPassed}','[]'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','draw_discard','playerId',_player_id,'card',v_top,'timestamp',v_now),true);

  ELSIF _action='pass_first_draw' THEN
    IF v_state->>'phase'<>'first_draw' OR v_state->>'firstDrawOfferedTo'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_first_draw_pass'; END IF;
    IF jsonb_array_length(coalesce(v_state->'firstDrawPassed','[]'::jsonb))=0 THEN
      v_state := jsonb_set(v_state,'{firstDrawPassed}',jsonb_build_array(_player_id),true);
      v_state := jsonb_set(v_state,'{firstDrawOfferedTo}',to_jsonb(v_state->>'dealerPlayerId'),true);
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_state->>'dealerPlayerId'),true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','pass_first_draw','playerId',_player_id,'timestamp',v_now),true);
    ELSE
      v_opponent := v_state->>'nonDealerPlayerId';
      v_top := v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
      IF v_top IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:stock_empty'; END IF;
      v_hand := v_state->'playerStates'->v_opponent->'hand' || jsonb_build_array(v_top);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'hand'],v_hand,true);
      v_state := jsonb_set(v_state,'{stockPile}',private.gin_array_pop(v_state->'stockPile'),true);
      v_state := jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
      v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
      v_state := jsonb_set(v_state,'{drawSource}','"stock"'::jsonb,true);
      v_state := jsonb_set(v_state,'{firstDrawOfferedTo}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{firstDrawPassed}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','draw_stock','playerId',v_opponent,'card',v_top,'timestamp',v_now),true);
    END IF;

  ELSIF _action IN ('draw_stock','draw_discard') THEN
    IF v_state->>'phase'<>'playing' OR v_state->>'currentTurnPlayerId'<>_player_id::text OR v_state->>'turnPhase'<>'draw' THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_draw'; END IF;
    IF _action='draw_stock' THEN
      IF jsonb_array_length(v_state->'stockPile')<=2 THEN RAISE EXCEPTION 'gin_rummy_apply_action:stock_exhausted'; END IF;
      v_top := v_state->'stockPile'->(jsonb_array_length(v_state->'stockPile')-1);
      v_state := jsonb_set(v_state,'{stockPile}',private.gin_array_pop(v_state->'stockPile'),true);
      v_state := jsonb_set(v_state,'{drawSource}','"stock"'::jsonb,true);
    ELSE
      IF jsonb_array_length(v_state->'discardPile')=0 THEN RAISE EXCEPTION 'gin_rummy_apply_action:discard_empty'; END IF;
      v_top := v_state->'discardPile'->(jsonb_array_length(v_state->'discardPile')-1);
      v_state := jsonb_set(v_state,'{discardPile}',private.gin_array_pop(v_state->'discardPile'),true);
      v_state := jsonb_set(v_state,'{drawSource}','"discard"'::jsonb,true);
    END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand' || jsonb_build_array(v_top);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{turnPhase}','"discard"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type',_action,'playerId',_player_id,'card',v_top,'timestamp',v_now),true);

  ELSIF _action IN ('discard','knock') THEN
    IF v_state->>'phase'<>'playing' OR v_state->>'currentTurnPlayerId'<>_player_id::text OR v_state->>'turnPhase'<>'discard' THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_discard'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand';
    v_actual_card := private.gin_find_card(v_hand,_card);
    IF v_actual_card IS NULL THEN RAISE EXCEPTION 'gin_rummy_apply_action:card_not_in_hand'; END IF;
    IF v_state->>'drawSource'='discard'
       AND private.gin_card_key(v_state->'lastAction'->'card')=private.gin_card_key(v_actual_card) THEN
      RAISE EXCEPTION 'gin_rummy_apply_action:cannot_rediscard_picked_discard';
    END IF;
    v_hand := private.gin_remove_cards(v_hand,jsonb_build_array(v_actual_card));
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,'{discardPile}',v_state->'discardPile'||jsonb_build_array(v_actual_card),true);
    v_opponent := CASE WHEN _player_id::text=v_state->>'dealerPlayerId' THEN v_state->>'nonDealerPlayerId' ELSE v_state->>'dealerPlayerId' END;
    IF _action='discard' THEN
      v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
      v_state := jsonb_set(v_state,'{turnPhase}','"draw"'::jsonb,true);
      v_state := jsonb_set(v_state,'{drawSource}','null'::jsonb,true);
      v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','discard','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      IF jsonb_array_length(v_state->'stockPile')<=2 THEN
        v_state := jsonb_set(v_state,'{phase}','"complete"'::jsonb,true);
        v_state := jsonb_set(v_state,'{knockResult}','null'::jsonb,true);
        v_state := jsonb_set(v_state,'{completeDueAt}',to_jsonb(to_char((clock_timestamp()+interval '2 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
      END IF;
    ELSE
      v_group := private.gin_optimal_grouping(v_hand);
      IF (v_group->>'deadwoodValue')::integer>10 THEN RAISE EXCEPTION 'gin_rummy_apply_action:deadwood_exceeds_knock_limit'; END IF;
      v_opponent_group := private.gin_optimal_grouping(v_state->'playerStates'->v_opponent->'hand');
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwoodValue'],v_group->'deadwoodValue',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasKnocked'],'true'::jsonb,true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasGin'],to_jsonb((v_group->>'deadwoodValue')::integer=0),true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'melds'],v_opponent_group->'melds',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'deadwood'],v_opponent_group->'deadwood',true);
      v_state := jsonb_set(v_state,ARRAY['playerStates',v_opponent,'deadwoodValue'],v_opponent_group->'deadwoodValue',true);
      IF (v_group->>'deadwoodValue')::integer=0 THEN
        v_state := jsonb_set(v_state,'{phase}','"scoring"'::jsonb,true);
        v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(_player_id::text),true);
        v_state := jsonb_set(v_state,'{scoringDueAt}',to_jsonb(to_char((clock_timestamp()+interval '4 seconds') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
        v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','gin','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      ELSE
        v_state := jsonb_set(v_state,'{phase}','"knocking"'::jsonb,true);
        v_state := jsonb_set(v_state,'{currentTurnPlayerId}',to_jsonb(v_opponent),true);
        v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','knock','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);
      END IF;
    END IF;

  ELSIF _action='lay_off' THEN
    IF v_state->>'phase' NOT IN ('knocking','laying_off') OR v_state->>'currentTurnPlayerId'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_layoff_actor'; END IF;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=_player_id::text OR coalesce((v_state->'playerStates'->v_knocker->>'hasGin')::boolean,false) THEN RAISE EXCEPTION 'gin_rummy_apply_action:layoff_not_allowed'; END IF;
    v_hand := v_state->'playerStates'->_player_id::text->'hand';
    v_actual_card := private.gin_find_card(v_hand,_card);
    v_melds := v_state->'playerStates'->v_knocker->'melds';
    v_target_meld := v_melds->_meld_index;
    IF v_actual_card IS NULL OR v_target_meld IS NULL OR NOT private.gin_can_lay_off(v_actual_card,v_target_meld) THEN RAISE EXCEPTION 'gin_rummy_apply_action:invalid_layoff'; END IF;
    v_new_meld := jsonb_set(v_target_meld,'{cards}',v_target_meld->'cards'||jsonb_build_array(v_actual_card),true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',v_knocker,'melds',_meld_index::text],v_new_meld,true);
    v_hand := private.gin_remove_cards(v_hand,jsonb_build_array(v_actual_card));
    v_group := private.gin_optimal_grouping(v_hand);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hand'],v_hand,true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'melds'],v_group->'melds',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwood'],v_group->'deadwood',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'deadwoodValue'],v_group->'deadwoodValue',true);
    v_state := jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'laidOffCards'],coalesce(v_state->'playerStates'->_player_id::text->'laidOffCards','[]'::jsonb)||jsonb_build_array(v_actual_card),true);
    v_state := jsonb_set(v_state,'{phase}','"laying_off"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','lay_off','playerId',_player_id,'card',v_actual_card,'timestamp',v_now),true);

  ELSIF _action='finish_lay_off' THEN
    IF v_state->>'phase' NOT IN ('knocking','laying_off') OR v_state->>'currentTurnPlayerId'<>_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_finish_layoff_actor'; END IF;
    SELECT key INTO v_knocker FROM jsonb_each(v_state->'playerStates')
     WHERE coalesce((value->>'hasKnocked')::boolean,false) OR coalesce((value->>'hasGin')::boolean,false) LIMIT 1;
    IF v_knocker IS NULL OR v_knocker=_player_id::text THEN RAISE EXCEPTION 'gin_rummy_apply_action:illegal_finish_layoff_actor'; END IF;
    v_state := jsonb_set(v_state,'{phase}','"scoring"'::jsonb,true);
    v_state := jsonb_set(v_state,'{lastAction}',jsonb_build_object('type','decline_lay_off','playerId',_player_id,'timestamp',v_now),true);

  ELSIF _action='finalize_scoring' THEN
    IF v_state->>'phase'<>'scoring' THEN
      RETURN jsonb_build_object('outcome','already_advanced','state',v_state);
    END IF;
  ELSE
    RAISE EXCEPTION 'gin_rummy_apply_action:unknown_action:%',_action;
  END IF;

  IF _action IN ('finish_lay_off','finalize_scoring') THEN
    v_state := private.gin_score_state(v_state,v_round.dealer_game_id);
  ELSE
    v_state := jsonb_set(v_state,'{actionCount}',to_jsonb(v_count+1),true);
    v_state := jsonb_set(v_state,'{botActionDueAt}',to_jsonb(to_char((clock_timestamp()+interval '1 second') AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),true);
  END IF;

  PERFORM private.gin_publish_state(_round_id,v_state);
  v_phase := v_state->>'phase';
  IF v_phase='complete' THEN
    IF nullif(v_state->>'winnerPlayerId','') IS NULL THEN
      PERFORM private.gin_record_hand_result(v_round,v_state);
    ELSE
      PERFORM public.gin_rummy_settle_game(v_round.game_id,v_round.id,v_round.dealer_game_id,v_round.hand_number);
    END IF;
  END IF;
  RETURN jsonb_build_object('outcome','applied','state',v_state);
END;
$function$;
CREATE OR REPLACE FUNCTION public.three_five_seven_submit_decision(p_game_id uuid, p_round_id uuid, p_dealer_game_id uuid, p_hand_number integer, p_round_number integer, p_player_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE;
  v_game public.games%ROWTYPE;
  v_player public.players%ROWTYPE;
  v_claim private.three_five_seven_round_resolutions%ROWTYPE;
  v_result jsonb;
  v_game_result jsonb;
  v_round_result jsonb;
BEGIN
  IF p_decision NOT IN ('stay','fold') THEN RAISE EXCEPTION 'three_five_seven_submit_decision:invalid_decision'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND OR v_round.game_id IS DISTINCT FROM p_game_id OR v_round.dealer_game_id IS DISTINCT FROM p_dealer_game_id
     OR v_round.hand_number IS DISTINCT FROM p_hand_number OR v_round.round_number IS DISTINCT FROM p_round_number THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:round_identity_mismatch';
  END IF;
  SELECT * INTO v_game FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'three_five_seven_submit_decision:game_not_found'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=p_player_id AND game_id=p_game_id FOR UPDATE;
  IF NOT FOUND OR v_player.status IN ('left','observer') OR coalesce(v_player.sitting_out,false) THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:player_not_eligible';
  END IF;
  IF coalesce(v_player.is_bot,false) OR auth.uid() IS DISTINCT FROM v_player.user_id THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:not_player_owner';
  END IF;

  IF coalesce(v_player.decision_locked,false) THEN
    IF v_player.current_decision<>p_decision THEN
      RAISE EXCEPTION 'three_five_seven_submit_decision:decision_already_locked';
    END IF;
    SELECT * INTO v_claim
      FROM private.three_five_seven_round_resolutions resolution
     WHERE resolution.game_id=p_game_id
       AND resolution.dealer_game_id=p_dealer_game_id
       AND resolution.round_id=p_round_id
       AND resolution.hand_number=p_hand_number
       AND resolution.round_number=p_round_number;
    v_game_result:=jsonb_build_object(
      'id',v_game.id,'current_game_uuid',v_game.current_game_uuid,
      'total_hands',v_game.total_hands,'current_round',v_game.current_round,
      'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
    );
    v_round_result:=jsonb_build_object(
      'id',v_round.id,'dealer_game_id',v_round.dealer_game_id,
      'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
    );
    RETURN jsonb_build_object(
      'outcome','already_decided','deduped',true,'decision',p_decision,
      'resolution',CASE WHEN FOUND THEN v_claim.result||jsonb_build_object('deduped',true) ELSE NULL END,
      'game',v_game_result,'round',v_round_result,
      'decision_reveal',private.three_five_seven_decision_reveal(
        p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number
      ),
      'server_now',statement_timestamp()
    );
  END IF;

  IF v_game.current_game_uuid IS DISTINCT FROM p_dealer_game_id OR v_game.total_hands IS DISTINCT FROM p_hand_number
     OR v_game.current_round IS DISTINCT FROM p_round_number OR v_game.status<>'in_progress' OR v_round.status<>'betting' THEN
    RAISE EXCEPTION 'three_five_seven_submit_decision:stale_game_identity';
  END IF;
  PERFORM private.assert_game_not_paused(p_game_id);
  PERFORM set_config('app.three_five_seven_authoritative_write','on',true);
  UPDATE public.players SET current_decision=p_decision,decision_locked=true WHERE id=p_player_id;
  v_result:=private.three_five_seven_resolve_round(p_game_id,p_round_id,p_dealer_game_id,p_hand_number,p_round_number);

  SELECT * INTO v_game FROM public.games WHERE id=p_game_id;
  SELECT * INTO v_round FROM public.rounds WHERE id=p_round_id;
  v_game_result:=jsonb_build_object(
    'id',v_game.id,'current_game_uuid',v_game.current_game_uuid,
    'total_hands',v_game.total_hands,'current_round',v_game.current_round,
    'awaiting_next_round',v_game.awaiting_next_round,'last_round_result',v_game.last_round_result
  );
  v_round_result:=jsonb_build_object(
    'id',v_round.id,'dealer_game_id',v_round.dealer_game_id,
    'hand_number',v_round.hand_number,'round_number',v_round.round_number,'status',v_round.status
  );
  RETURN jsonb_build_object(
    'outcome','decision_committed','decision',p_decision,'resolution',v_result,
    'game',v_game_result,'round',v_round_result,
    'decision_reveal',private.three_five_seven_decision_reveal(
      p_game_id,p_dealer_game_id,p_round_id,p_hand_number,p_round_number
    ),
    'server_now',statement_timestamp()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.cribbage_apply_discard(_round_id uuid, _player_id uuid, _card_indices integer[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE; v_state jsonb; v_player public.players%ROWTYPE; v_ps jsonb; v_hand jsonb;
  v_discard jsonb:='[]'::jsonb; v_remaining jsonb:='[]'::jsonb; v_i integer; v_expected integer; v_count integer; v_all boolean:=true; v_key text;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_apply_discard:authentication_required'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_apply_discard:round_not_found'; END IF;
  PERFORM private.assert_game_not_paused(v_round.game_id);
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_apply_discard:not_in_session'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=_player_id AND game_id=v_round.game_id;
  IF NOT FOUND OR (NOT v_service AND NOT coalesce(v_player.is_bot,false) AND v_player.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'cribbage_apply_discard:not_player_owner'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'<>'discarding' THEN RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid()); END IF;
  v_ps:=v_state->'playerStates'->_player_id::text;
  IF jsonb_array_length(coalesce(v_ps->'discardedToCrib','[]'::jsonb))>0 THEN RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid()); END IF;
  SELECT count(*) INTO v_count FROM jsonb_object_keys(v_state->'playerStates'); v_expected:=CASE WHEN v_count=2 THEN 2 ELSE 1 END;
  IF cardinality(_card_indices) IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'cribbage_apply_discard:invalid_count'; END IF;
  v_hand:=coalesce(v_ps->'hand','[]'::jsonb);
  FOR v_i IN 0..jsonb_array_length(v_hand)-1 LOOP IF v_i=ANY(_card_indices) THEN v_discard:=v_discard||jsonb_build_array(v_hand->v_i); ELSE v_remaining:=v_remaining||jsonb_build_array(v_hand->v_i); END IF; END LOOP;
  IF jsonb_array_length(v_discard)<>v_expected THEN RAISE EXCEPTION 'cribbage_apply_discard:invalid_indices'; END IF;
  v_ps:=jsonb_set(v_ps,'{hand}',v_remaining,true); v_ps:=jsonb_set(v_ps,'{discardedToCrib}',v_discard,true);
  v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
  v_state:=jsonb_set(v_state,'{crib}',coalesce(v_state->'crib','[]'::jsonb)||v_discard,true);
  FOR v_key IN SELECT jsonb_object_keys(v_state->'playerStates') LOOP IF jsonb_array_length(coalesce(v_state->'playerStates'->v_key->'discardedToCrib','[]'::jsonb))<>v_expected THEN v_all:=false; EXIT; END IF; END LOOP;
  IF v_all THEN v_state:=private.cribbage_finish_discard(v_state,v_round.game_id); END IF;
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  RETURN private.cribbage_project_state(v_state,v_round.game_id,auth.uid());
END;
$function$;
CREATE OR REPLACE FUNCTION public.cribbage_apply_pegging_action(_round_id uuid, _player_id uuid, _action text, _card_index integer DEFAULT NULL::integer, _expected_event_sequence integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_round public.rounds%ROWTYPE; v_game public.games%ROWTYPE; v_player public.players%ROWTYPE; v_state jsonb; v_ps jsonb; v_hand jsonb;
  v_card jsonb; v_remaining jsonb:='[]'::jsonb; v_played jsonb; v_run jsonb; v_i integer; v_len integer; v_count integer; v_new_count integer;
  v_points integer:=0; v_pair_count integer:=1; v_pair_points integer:=0; v_run_points integer:=0; v_is_run boolean; v_min integer; v_max integer; v_distinct integer;
  v_last_card boolean; v_score integer; v_label text; v_seq integer; v_candidate text; v_current_index integer:=0;
  v_service boolean:=coalesce(auth.jwt()->>'role','')='service_role'; v_action text:=_action;
BEGIN
  IF auth.uid() IS NULL AND NOT v_service THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:authentication_required'; END IF;
  IF v_action NOT IN ('play','go','auto') THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:invalid_action'; END IF;
  SELECT * INTO v_round FROM public.rounds WHERE id=_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:round_not_found'; END IF;
  PERFORM private.assert_game_not_paused(v_round.game_id);
  SELECT * INTO v_game FROM public.games WHERE id=v_round.game_id FOR UPDATE;
  IF v_game.game_type IS DISTINCT FROM 'cribbage' OR v_game.current_game_uuid IS DISTINCT FROM v_round.dealer_game_id OR v_game.total_hands IS DISTINCT FROM v_round.hand_number THEN
    RETURN jsonb_build_object('outcome','stale_identity');
  END IF;
  IF NOT v_service AND NOT public.user_is_in_game(v_round.game_id) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:not_in_session'; END IF;
  SELECT * INTO v_player FROM public.players WHERE id=_player_id AND game_id=v_round.game_id;
  IF NOT FOUND OR (NOT v_service AND NOT coalesce(v_player.is_bot,false) AND v_player.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:not_player_owner'; END IF;
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id FOR UPDATE;
  IF v_state->>'phase'<>'pegging' OR v_state->'pegging'->>'currentTurnPlayerId'<>_player_id::text THEN
    RETURN jsonb_build_object('outcome','stale','state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()));
  END IF;
  v_seq:=coalesce((v_state->'pegging'->>'eventSequence')::integer,0);
  IF _expected_event_sequence IS NOT NULL AND _expected_event_sequence<>v_seq THEN
    RETURN jsonb_build_object('outcome','stale','event_sequence',v_seq,'state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()));
  END IF;
  v_ps:=v_state->'playerStates'->_player_id::text; v_hand:=coalesce(v_ps->'hand','[]'::jsonb);
  IF v_action='auto' THEN
    IF NOT coalesce(v_player.is_bot,false) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:auto_requires_bot'; END IF;
    SELECT item.ordinality::integer-1
      INTO _card_index
      FROM jsonb_array_elements(v_hand) WITH ORDINALITY item(card,ordinality)
     WHERE private.cribbage_card_value(item.card)+(v_state->'pegging'->>'currentCount')::integer<=31
     ORDER BY item.ordinality
     LIMIT 1;
    v_action:=CASE WHEN _card_index IS NULL THEN 'go' ELSE 'play' END;
  END IF;
  IF v_action='go' THEN
    IF private.cribbage_has_playable(v_hand,(v_state->'pegging'->>'currentCount')::integer) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:play_available'; END IF;
    IF NOT (coalesce(v_state->'pegging'->'goCalledBy','[]'::jsonb) ? _player_id::text) THEN
      v_state:=jsonb_set(v_state,'{pegging,goCalledBy}',coalesce(v_state->'pegging'->'goCalledBy','[]'::jsonb)||jsonb_build_array(_player_id::text),true);
      v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text,'hasCalledGo'],'true'::jsonb,true);
      v_state:=jsonb_set(v_state,'{pegging,eventSequence}',to_jsonb(v_seq+1),true);
    END IF;
    v_state:=private.cribbage_advance_pegging(v_state);
  ELSE
    IF _card_index IS NULL OR _card_index<0 OR _card_index>=jsonb_array_length(v_hand) THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:invalid_card_index'; END IF;
    v_card:=v_hand->_card_index; v_count:=(v_state->'pegging'->>'currentCount')::integer; v_new_count:=v_count+private.cribbage_card_value(v_card);
    IF v_new_count>31 THEN RAISE EXCEPTION 'cribbage_apply_pegging_action:exceeds_31'; END IF;
    FOR v_i IN 0..jsonb_array_length(v_hand)-1 LOOP IF v_i<>_card_index THEN v_remaining:=v_remaining||jsonb_build_array(v_hand->v_i); END IF; END LOOP;
    v_last_card:=jsonb_array_length(v_remaining)=0 AND NOT EXISTS(
      SELECT 1 FROM jsonb_each(v_state->'playerStates') entry
       WHERE entry.key<>_player_id::text AND jsonb_array_length(coalesce(entry.value->'hand','[]'::jsonb))>0);
    v_played:=coalesce(v_state->'pegging'->'playedCards','[]'::jsonb);
    SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO v_run
      FROM jsonb_array_elements(v_played) WITH ORDINALITY item(value,ordinality)
     WHERE ordinality>(coalesce((v_state->'pegging'->>'sequenceStartIndex')::integer,0));
    IF v_count<>0 AND jsonb_array_length(v_run)>0 THEN
      FOR v_i IN REVERSE jsonb_array_length(v_run)-1..0 LOOP EXIT WHEN v_run->v_i->'card'->>'rank'<>v_card->>'rank'; v_pair_count:=v_pair_count+1; END LOOP;
      IF v_pair_count>=2 THEN v_pair_points:=v_pair_count*(v_pair_count-1); END IF;
    END IF;
    FOR v_len IN REVERSE least(7,jsonb_array_length(v_run)+1)..3 LOOP
      SELECT min(private.cribbage_rank_value(card->>'rank')),max(private.cribbage_rank_value(card->>'rank')),count(DISTINCT private.cribbage_rank_value(card->>'rank'))
        INTO v_min,v_max,v_distinct FROM (
          SELECT value->'card' card FROM jsonb_array_elements(v_run) WITH ORDINALITY r(value,ordinality)
           WHERE ordinality>jsonb_array_length(v_run)-(v_len-1)
          UNION ALL SELECT v_card
        ) cards;
      IF v_distinct=v_len AND v_max-v_min=v_len-1 THEN v_run_points:=v_len; EXIT; END IF;
    END LOOP;
    v_points:=CASE WHEN v_new_count=15 THEN 2 ELSE 0 END+CASE WHEN v_new_count=31 THEN 2 ELSE 0 END+v_pair_points+v_run_points+CASE WHEN v_last_card AND v_new_count<>31 THEN 1 ELSE 0 END;
    v_score:=coalesce((v_ps->>'pegScore')::integer,0)+v_points;
    v_ps:=jsonb_set(v_ps,'{hand}',v_remaining,true); v_ps:=jsonb_set(v_ps,'{pegScore}',to_jsonb(v_score),true); v_ps:=jsonb_set(v_ps,'{hasCalledGo}','false'::jsonb,true);
    v_state:=jsonb_set(v_state,ARRAY['playerStates',_player_id::text],v_ps,true);
    v_state:=jsonb_set(v_state,'{pegging,playedCards}',v_played||jsonb_build_array(jsonb_build_object('playerId',_player_id,'card',v_card)),true);
    v_state:=jsonb_set(v_state,'{pegging,currentCount}',to_jsonb(v_new_count),true);
    v_state:=jsonb_set(v_state,'{pegging,eventSequence}',to_jsonb(v_seq+1),true);
    v_state:=jsonb_set(v_state,'{pegging,lastToPlay}',to_jsonb(_player_id::text),true);
    v_state:=v_state#-'{pegging,pendingGoBubblePlayerIds}';
    IF v_points>0 THEN
      v_label:=concat_ws(', ',CASE WHEN v_new_count=15 THEN '15 for 2' END,CASE WHEN v_new_count=31 THEN '31 for 2' END,
        CASE WHEN v_pair_points>0 THEN CASE v_pair_count WHEN 2 THEN 'Pair' WHEN 3 THEN 'Three of a Kind' ELSE 'Four of a Kind' END END,
        CASE WHEN v_run_points>0 THEN 'Run of '||v_run_points END,CASE WHEN v_last_card AND v_new_count<>31 THEN 'Last Card' END);
      v_state:=jsonb_set(v_state,'{lastEvent}',jsonb_build_object('id',gen_random_uuid(),'type','pegging_points','playerId',_player_id,'points',v_points,'label',v_label,'createdAt',to_char(clock_timestamp() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'count',v_new_count),true);
    END IF;
    IF v_score>=coalesce((v_state->>'pointsToWin')::integer,121) THEN v_state:=private.cribbage_finish_match(v_state,_player_id::text);
    ELSIF v_last_card THEN v_state:=private.cribbage_enter_counting(v_state);
    ELSIF v_new_count=31 THEN
      v_state:=jsonb_set(v_state,'{pegging,currentCount}','0'::jsonb,true); v_state:=jsonb_set(v_state,'{pegging,goCalledBy}','[]'::jsonb,true);
      v_state:=jsonb_set(v_state,'{pegging,lastToPlay}','null'::jsonb,true); v_state:=jsonb_set(v_state,'{pegging,sequenceStartIndex}',to_jsonb(jsonb_array_length(v_state->'pegging'->'playedCards')),true);
      FOR v_i IN 0..jsonb_array_length(v_state->'turnOrder')-1 LOOP
        IF v_state->'turnOrder'->>v_i=_player_id::text THEN v_current_index:=v_i; EXIT; END IF;
      END LOOP;
      FOR v_i IN 1..jsonb_array_length(v_state->'turnOrder') LOOP
        v_candidate:=v_state->'turnOrder'->>((v_current_index+v_i)%jsonb_array_length(v_state->'turnOrder'));
        IF jsonb_array_length(coalesce(v_state->'playerStates'->v_candidate->'hand','[]'::jsonb))>0 THEN EXIT; END IF;
        v_candidate:=NULL;
      END LOOP;
      v_state:=jsonb_set(v_state,'{pegging,currentTurnPlayerId}',coalesce(to_jsonb(v_candidate),'null'::jsonb),true);
    ELSE v_state:=private.cribbage_advance_pegging(v_state); END IF;
  END IF;
  PERFORM private.cribbage_publish_state(_round_id,v_state);
  SELECT state INTO v_state FROM private.cribbage_round_states WHERE round_id=_round_id;
  RETURN jsonb_build_object('outcome','applied','state',private.cribbage_project_state(v_state,v_round.game_id,auth.uid()),'event_sequence',coalesce((v_state->'pegging'->>'eventSequence')::integer,0));
END;
$function$;
