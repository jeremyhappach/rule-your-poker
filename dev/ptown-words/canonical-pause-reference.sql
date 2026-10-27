-- Local clone compatibility; canonical source: 20260905022955 pause envelope.
CREATE OR REPLACE FUNCTION private.shift_pause_timestamp(p_state jsonb,p_path text[],p_duration interval) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN nullif(p_state#>>p_path,'') IS NULL THEN p_state
 ELSE jsonb_set(p_state,p_path,to_jsonb((p_state#>>p_path)::timestamptz+p_duration),false) END
$$;
REVOKE ALL ON FUNCTION private.shift_pause_timestamp(jsonb,text[],interval) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_game_paused(p_game_id uuid, p_paused boolean, p_expected_dealer_game_id uuid, p_expected_pause_version bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); v_replay_shared jsonb; v_replay_return jsonb; g public.games%ROWTYPE; now_at timestamptz:=clock_timestamp(); duration interval; remaining integer;
 ctx text; prior jsonb:='{}'; state_row record; shifted jsonb; result jsonb;
BEGIN
 PERFORM private.farkle_require_active_actor_v1(p_game_id,p_expected_dealer_game_id,false);
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
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF coalesce(auth.jwt()->>'role','')<>'service_role' AND (auth.uid() IS NULL OR (
 NOT public.has_role(auth.uid(),'admin'::public.app_role) AND (
 g.current_host IS DISTINCT FROM auth.uid() OR NOT EXISTS(SELECT 1 FROM public.players WHERE game_id=g.id AND user_id=auth.uid()
 AND NOT is_bot AND position IS NOT NULL AND status NOT IN ('left','observer')))))
 THEN v_replay_return := jsonb_build_object('outcome','not_authorized');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.current_game_uuid IS DISTINCT FROM p_expected_dealer_game_id OR g.pause_version IS DISTINCT FROM p_expected_pause_version
 OR (g.status IN ('session_ended','completed') AND private.three_five_seven_hidden_round(g.id,true) IS NULL) THEN v_replay_return := jsonb_build_object('outcome','stale_identity');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF coalesce(g.is_paused,false)=p_paused THEN v_replay_return := jsonb_build_object('outcome','already_set','is_paused',p_paused,'pause_version',g.pause_version);
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return; END IF;
 IF g.game_type='farkle' THEN PERFORM private.farkle_claim_v1(g.id,g.current_game_uuid,NULL,'pause'); END IF;
 FOREACH ctx IN ARRAY ARRAY['app.session_pause_write','app.three_five_seven_authoritative_write','app.cribbage_authoritative_write','app.gin_rummy_authoritative_write','app.yahtzee_authoritative_write'] LOOP
  prior:=prior||jsonb_build_object(ctx,coalesce(current_setting(ctx,true),''));
  PERFORM set_config(ctx,'on',true); END LOOP;
 IF p_paused THEN
  SELECT greatest(0,ceil(extract(epoch FROM (min(due_at)-now_at))))::integer INTO remaining
  FROM private.game_timer_registry WHERE game_id=g.id AND state='scheduled';
  IF private.three_five_seven_hidden_round(g.id,true) IS NOT NULL THEN
    SELECT greatest(0,ceil(extract(epoch FROM ((private.three_five_seven_decision_reveal(
      r.game_id,r.dealer_game_id,r.id,r.hand_number,r.round_number)->>'drop_at')::timestamptz-now_at))))::integer
    INTO remaining FROM public.rounds r WHERE r.id=private.three_five_seven_hidden_round(g.id,true);
   END IF;
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
   farkle_state=private.shift_pause_timestamp(farkle_state,ARRAY['turnDeadline'],duration),
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
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
EXCEPTION WHEN lock_not_available THEN v_replay_return := jsonb_build_object('outcome','busy');
 IF v_replay_shared IS NOT NULL THEN PERFORM private.replay_gin_shared_end_v1(v_replay_shared,jsonb_build_object('p_game_id',p_game_id,'p_paused',p_paused,'p_expected_dealer_game_id',p_expected_dealer_game_id,'p_expected_pause_version',p_expected_pause_version),to_jsonb(v_replay_return)); END IF;
 PERFORM set_config('app.farkle_authority',v_prior_farkle_claim,true); RETURN v_replay_return;
END $function$
;
REVOKE ALL ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_game_paused(uuid,boolean,uuid,bigint) TO authenticated;
