-- Farkle-only final-die correction. The client still sends one Roll action;
-- the reducer commits the unambiguous 1/5 through the normal event path.
DO $guard$
BEGIN
  PERFORM pg_advisory_xact_lock(19092026,1);
  IF md5(pg_get_functiondef('private.farkle_reduce_v1(jsonb,text,jsonb,integer[])'::regprocedure)) <> '7693fda07d3ad8cc27e6a113e3399888'
  THEN RAISE EXCEPTION 'farkle_final_single_die:reducer_owner_drift'; END IF;
  IF md5(pg_get_functiondef('public.farkle_apply_action(uuid,uuid,text,bigint,uuid,jsonb)'::regprocedure)) <> 'fc22fa88a8d909f6bc836e3c1d8e4611'
  THEN RAISE EXCEPTION 'farkle_final_single_die:action_owner_drift'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION private.farkle_reduce_v1(s jsonb, action text, selection jsonb, rolled integer[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  config jsonb:=s->'config'; dice jsonb:='[]'; legal jsonb; hold jsonb; available jsonb; i integer; event jsonb;
BEGIN
  IF s->>'version' IS DISTINCT FROM '1' OR s->>'gamePhase' IS DISTINCT FROM 'playing' THEN RAISE EXCEPTION 'farkle:not_playing'; END IF;
  s:=s||jsonb_build_object('events','[]'::jsonb,'actionSequence',(s->>'actionSequence')::bigint+1);
  IF action='roll' THEN
    IF s->>'stage' NOT IN ('roll','bank_or_roll') OR cardinality(rolled) IS DISTINCT FROM jsonb_array_length(s->'available')
    OR EXISTS(SELECT 1 FROM unnest(rolled) v WHERE v IS NULL OR v NOT BETWEEN 1 AND 6)
    THEN RAISE EXCEPTION 'farkle:illegal_roll'; END IF;
    FOR i IN 0..cardinality(rolled)-1 LOOP dice:=dice||jsonb_build_array(jsonb_build_object('index',s->'available'->i,'value',rolled[i+1])); END LOOP;
    legal:=private.farkle_legal_holds_v1(dice,config->'rules');
    event:=jsonb_build_object('type','dice_rolled','playerId',s->'currentTurnPlayerId','dice',dice,'rollNumber',(s->>'rollNumber')::integer+1,'scoringCycle',s->'scoringCycle');
    s:=s||jsonb_build_object('dice',dice,'legalHolds',legal,'rollNumber',(s->>'rollNumber')::integer+1,'stage','hold','events',jsonb_build_array(event));
    IF legal='[]'::jsonb THEN
      s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','farkle','playerId',s->'currentTurnPlayerId','lost',s->'thisTurn')));
      s:=private.farkle_finish_turn_v1(s,false);
    ELSIF jsonb_array_length(s->'available')=1 AND jsonb_array_length(dice)=1
      AND (dice->0->>'value')::integer IN (1,5) THEN
      -- Exactly one available die has no meaningful selection choice. Use the
      -- same authoritative Hold and HOT DICE receipts as a manual Hold.
      SELECT value INTO hold FROM jsonb_array_elements(legal)
      WHERE jsonb_array_length(value->'indexes')=1;
      IF hold IS NULL THEN RAISE EXCEPTION 'farkle:final_die_not_scoring'; END IF;
      selection:=hold->'indexes';
      SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO available
      FROM jsonb_array_elements(s->'available') WITH ORDINALITY
      WHERE NOT selection @> jsonb_build_array(value);
      s:=s||jsonb_build_object('thisTurn',(s->>'thisTurn')::bigint+(hold->>'points')::bigint,'available',available,'stage','bank_or_roll','legalHolds','[]'::jsonb);
      event:=jsonb_build_object('type','dice_held','playerId',s->'currentTurnPlayerId','indexes',selection,'points',hold->'points','thisTurn',s->'thisTurn','rollNumber',s->'rollNumber');
      s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(event));
      s:=s||jsonb_build_object('available',jsonb_build_array(0,1,2,3,4,5),'scoringCycle',(s->>'scoringCycle')::integer+1);
      s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','hot_dice','thisTurn',s->'thisTurn','scoringCycle',s->'scoringCycle')));
    END IF;
  ELSIF action='hold' THEN
    IF s->>'stage'<>'hold' OR jsonb_typeof(selection) IS DISTINCT FROM 'array' OR jsonb_array_length(selection)=0
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection) v WHERE jsonb_typeof(v)<>'number' OR v::text !~ '^[0-5]$')
    OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(selection))<>jsonb_array_length(selection)
    THEN RAISE EXCEPTION 'farkle:illegal_hold'; END IF;
    SELECT jsonb_agg(value::integer ORDER BY value::integer) INTO selection FROM jsonb_array_elements_text(selection);
    SELECT value INTO hold FROM jsonb_array_elements(s->'legalHolds') WHERE value->'indexes'=selection;
    IF hold IS NULL THEN RAISE EXCEPTION 'farkle:non_scoring_selection'; END IF;
    SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]') INTO available FROM jsonb_array_elements(s->'available') WITH ORDINALITY WHERE NOT selection @> jsonb_build_array(value);
    s:=s||jsonb_build_object('thisTurn',(s->>'thisTurn')::bigint+(hold->>'points')::bigint,'available',available,'stage','bank_or_roll','legalHolds','[]'::jsonb);
    event:=jsonb_build_object('type','dice_held','playerId',s->'currentTurnPlayerId','indexes',selection,'points',hold->'points','thisTurn',s->'thisTurn','rollNumber',s->'rollNumber');
    s:=jsonb_set(s,'{events}',jsonb_build_array(event));
    IF available='[]'::jsonb THEN
      s:=s||jsonb_build_object('available',jsonb_build_array(0,1,2,3,4,5),'scoringCycle',(s->>'scoringCycle')::integer+1);
      s:=jsonb_set(s,'{events}',s->'events'||jsonb_build_array(jsonb_build_object('type','hot_dice','thisTurn',s->'thisTurn','scoringCycle',s->'scoringCycle')));
    END IF;
  ELSIF action='bank' THEN
    IF s->>'stage'<>'bank_or_roll' OR (s->>'thisTurn')::bigint<=0 THEN RAISE EXCEPTION 'farkle:illegal_bank'; END IF;
    s:=jsonb_set(s,'{events}',jsonb_build_array(jsonb_build_object('type','banked','playerId',s->'currentTurnPlayerId','points',s->'thisTurn')));
    s:=private.farkle_finish_turn_v1(s,true);
  ELSE RAISE EXCEPTION 'farkle:unknown_action'; END IF;
  RETURN s;
END $function$;

-- The reducer can emit HOT DICE from a Roll when one die remains. Preserve the
-- existing renewal rule for that authoritative event regardless of client verb.
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
 UPDATE public.players SET auto_fold=false,auto_play_stop_round_id=NULL
 WHERE game_id=g.id AND auto_play_stop_round_id=r.id
 AND (s->>'gamePhase'<>'playing' OR s->>'currentTurnPlayerId' IS DISTINCT FROM id::text);
 IF s->>'gamePhase'='playing' THEN
  SELECT * INTO next_actor FROM public.players WHERE id=(s->>'currentTurnPlayerId')::uuid AND game_id=g.id;
  IF s->>'currentTurnPlayerId' IS DISTINCT FROM p.id::text
    OR next_actor.is_bot OR next_actor.auto_fold
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(s->'events') event WHERE event->>'type'='hot_dice') THEN
   s:=jsonb_set(s,'{turnDeadline}',to_jsonb(clock_timestamp()+make_interval(secs=>CASE WHEN next_actor.is_bot OR next_actor.auto_fold
    THEN (d.config->>'botDelayMs')::numeric/1000 ELSE (d.config->>'turnSeconds')::numeric END)));
  END IF;
 ELSE s:=s||jsonb_build_object('turnDeadline',NULL); END IF;
 UPDATE public.rounds SET farkle_state=s WHERE id=r.id;
 IF s->>'gamePhase'='complete' THEN terminal:=private.farkle_settle_v1(r.id); END IF;
 INSERT INTO private.farkle_events(round_id,sequence,dealer_game_id,actor_id,events,state_after,config_hash)
 VALUES(r.id,(s->>'actionSequence')::bigint,d.id,p.id,s->'events',s,md5(d.config::text));
 result:=jsonb_build_object('outcome','applied','deduped',false,'action_sequence',s->'actionSequence','state',s,'settlement',terminal);
 INSERT INTO private.farkle_action_receipts(round_id,request_id,actor_id,request,response) VALUES(r.id,p_request_id,p.id,request,result);
 PERFORM set_config('app.farkle_authority',prior_farkle_claim,true); RETURN result;
END $function$;
