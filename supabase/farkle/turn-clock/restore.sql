-- Executable forward recovery for the Farkle turn-clock correction.
-- Existing dealer-game snapshots and action history remain immutable.
BEGIN;
DO $guard$
BEGIN
  PERFORM pg_advisory_xact_lock(19092026,1);
  IF md5(pg_get_functiondef('public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)'::regprocedure)) <> 'fc22fa88a8d909f6bc836e3c1d8e4611'
  THEN RAISE EXCEPTION 'farkle_turn_clock_recovery:action_owner_drift'; END IF;
  IF EXISTS (SELECT 1 FROM public.games WHERE game_type='farkle' AND status IN ('in_progress','ante_decision'))
  THEN RAISE EXCEPTION 'farkle_turn_clock_recovery:active_games'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_defaults WHERE game_type='farkle' AND decision_timer_seconds=60)
  THEN RAISE EXCEPTION 'farkle_turn_clock_recovery:default_drift'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.farkle_apply_action(p_round_id uuid, p_player_id uuid, p_action text, p_expected_sequence bigint, p_request_id uuid, p_selection jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE prior_farkle_claim text:=coalesce(current_setting('app.farkle_authority',true),''); r public.rounds; g public.games; p public.players; d public.dealer_games; receipt private.farkle_action_receipts;
 s jsonb; request jsonb; result jsonb; rolled integer[]; terminal jsonb; next_actor public.players; service boolean:=coalesce(auth.jwt()->>'role','')='service_role';
BEGIN
 IF p_request_id IS NULL OR p_expected_sequence IS NULL OR p_action NOT IN ('roll','hold','bank') OR p_selection IS NULL
 OR (auth.uid() IS NULL AND NOT service) THEN RAISE EXCEPTION 'farkle:invalid_action_request' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.rounds WHERE id=p_round_id FOR UPDATE;
 IF NOT FOUND OR r.farkle_state IS NULL THEN RAISE EXCEPTION 'farkle:round_not_found'; END IF;
 SELECT * INTO g FROM public.games WHERE id=r.game_id FOR UPDATE;
 SELECT * INTO p FROM public.players WHERE id=p_player_id AND game_id=r.game_id FOR UPDATE;
 IF NOT FOUND OR NOT (r.farkle_state->'playerStates' ? p.id::text)
 OR (NOT service AND (p.is_bot OR p.user_id IS DISTINCT FROM auth.uid())) THEN RAISE EXCEPTION 'farkle:not_authorized' USING ERRCODE='42501'; END IF;
 request:=jsonb_build_object('actor',p_player_id,'action',p_action,'expectedSequence',p_expected_sequence,'selection',p_selection);
 SELECT * INTO receipt FROM private.farkle_action_receipts WHERE round_id=r.id AND request_id=p_request_id;
 IF FOUND THEN
  IF receipt.actor_id<>p_player_id OR receipt.request IS DISTINCT FROM request THEN RAISE EXCEPTION 'farkle:replay_payload_mismatch'; END IF;
  PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN receipt.response||jsonb_build_object('deduped',true);
 END IF;
 s:=r.farkle_state;
 IF g.game_type<>'farkle' OR g.current_game_uuid IS DISTINCT FROM r.dealer_game_id OR g.current_round<>r.round_number OR g.total_hands<>r.hand_number
 OR g.status<>'in_progress' OR r.status='completed' OR s->>'gamePhase'<>'playing'
 THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_identity','state',s); END IF;
 IF g.is_paused THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','paused','state',s); END IF;
 IF (s->>'actionSequence')::bigint<>p_expected_sequence THEN PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN jsonb_build_object('outcome','stale_action','state',s); END IF;
 IF s->>'currentTurnPlayerId'<>p.id::text OR (NOT service AND p.auto_fold) OR (service AND NOT (p.is_bot OR p.auto_fold))
 THEN RAISE EXCEPTION 'farkle:not_controller' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dealer_games WHERE id=r.dealer_game_id AND session_id=g.id AND game_type='farkle';
 IF NOT FOUND OR s->'config' IS DISTINCT FROM d.config THEN RAISE EXCEPTION 'farkle:frozen_config_mismatch'; END IF;
 IF p_action<>'hold' AND p_selection<>'[]'::jsonb THEN RAISE EXCEPTION 'farkle:unexpected_selection'; END IF;
 IF p_action='roll' THEN SELECT array_agg(private.secure_random_int(6)+1 ORDER BY i) INTO rolled FROM generate_series(1,jsonb_array_length(s->'available')) i; END IF;
 s:=private.farkle_reduce_v1(s,p_action,p_selection,rolled);
 PERFORM private.farkle_claim_v1(g.id,d.id,r.id,'action');
 -- Horses reclaim semantics: a pending request is consumed only after that
 -- player's complete turn, including a BANK, Farkle or terminal completion.
 UPDATE public.players SET auto_fold=false,auto_play_stop_round_id=NULL
 WHERE game_id=g.id AND auto_play_stop_round_id=r.id
 AND (s->>'gamePhase'<>'playing' OR s->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 IF s->>'gamePhase'='playing' THEN
  SELECT * INTO next_actor FROM public.players WHERE id=(s->>'currentTurnPlayerId')::uuid AND game_id=g.id;
  s:=jsonb_set(s,'{turnDeadline}',to_jsonb(clock_timestamp()+make_interval(secs=>CASE WHEN next_actor.is_bot OR next_actor.auto_fold
   THEN (d.config->>'botDelayMs')::numeric/1000 ELSE (d.config->>'turnSeconds')::numeric END)));
 ELSE s:=s||jsonb_build_object('turnDeadline',NULL); END IF;
 UPDATE public.rounds SET farkle_state=s WHERE id=r.id;
 IF s->>'gamePhase'='complete' THEN terminal:=private.farkle_settle_v1(r.id); END IF;
 INSERT INTO private.farkle_events(round_id,sequence,dealer_game_id,actor_id,events,state_after,config_hash)
 VALUES(r.id,(s->>'actionSequence')::bigint,d.id,p.id,s->'events',s,md5(d.config::text));
 result:=jsonb_build_object('outcome','applied','deduped',false,'action_sequence',s->'actionSequence','state',s,'settlement',terminal);
 INSERT INTO private.farkle_action_receipts(round_id,request_id,actor_id,request,response) VALUES(r.id,p_request_id,p.id,request,result);
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN result;
END $function$
;
UPDATE public.game_defaults SET decision_timer_seconds=10
WHERE game_type='farkle' AND decision_timer_seconds=60;
COMMIT;