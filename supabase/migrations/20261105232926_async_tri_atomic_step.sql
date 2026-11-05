-- Async orchestration only. Frozen board rules, receipts, review triggers and
-- canonical finances remain in their existing owners. Additive / rollback-safe.
CREATE OR REPLACE FUNCTION private.delayed_tri_transition(r jsonb, intent jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s jsonb:=r->'state'; b jsonb; cfg jsonb:=r->'config';
 at_i bigint:=(r->>'server_at')::bigint; due_i bigint; expiry bigint;
 player text; turn_i integer; round_i integer; score_i bigint; advanced boolean:=false;
 action_i text:=intent->>'type';
BEGIN
 IF s IS NULL OR s='null'::jsonb THEN
  s:=jsonb_build_object('version','delayed/1','game','tri-towers','child',r->'id',
   'players',jsonb_build_array(r->'starter',CASE WHEN r->>'starter'=r->>'organizer' THEN r->'opponent' ELSE r->'organizer' END),
   'round',1,'turn',0,'totals',jsonb_build_object(r->>'organizer',0,r->>'opponent',0),
   'attempts','[]'::jsonb,'board',NULL,'deck',NULL,'completed',false,'winner',NULL,'segmentStartedAt',NULL);
 END IF;
 turn_i:=(s->>'turn')::integer;round_i:=(s->>'round')::integer;player:=s->'players'->>turn_i;
 IF s->>'child' IS DISTINCT FROM r->>'id' OR s->>'game'<>'tri-towers' OR player IS DISTINCT FROM r->>'actor' OR (s->>'completed')::boolean THEN RAISE EXCEPTION 'delayed:identity';END IF;
 b:=nullif(s->'board','null');due_i:=(b->>'deadline')::bigint;
 expiry:=floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000)::bigint;
 IF at_i>=expiry AND (due_i IS NULL OR expiry<=due_i) THEN
  RETURN jsonb_build_object('state',s,'advanced',false,'at',expiry);
 END IF;
 IF due_i IS NOT NULL AND at_i>=due_i THEN
  at_i:=due_i;b:=public.delayed_tri_core('reduce',cfg,0,b,'tick',NULL,at_i);
 ELSIF action_i='tick' THEN RETURN jsonb_build_object('state',s,'advanced',false,'at',at_i);
 ELSIF action_i='start' THEN
  IF b IS NOT NULL THEN RAISE EXCEPTION 'delayed:already_started';END IF;
  b:=public.delayed_tri_core('deal',cfg,(s->'totals'->>player)::bigint,NULL,NULL,NULL,at_i);
  s:=jsonb_set(s,'{segmentStartedAt}',to_jsonb(at_i));
 ELSE
  IF b IS NULL THEN RAISE EXCEPTION 'delayed:not_started';END IF;
  IF action_i NOT IN('remove','draw','take_score') THEN RAISE EXCEPTION 'delayed:invalid_action';END IF;
  b:=public.delayed_tri_core('reduce',cfg,0,b,action_i,(intent->>'index')::integer,at_i);
 END IF;
 s:=jsonb_set(s,'{board}',b);
 IF b->>'phase'='stage_complete' THEN
  score_i:=(b->>'score')::bigint-(s->'totals'->>player)::bigint;
  s:=jsonb_set(s,ARRAY['totals',player],to_jsonb((b->>'score')::bigint));
  s:=jsonb_set(s,'{attempts}',(s->'attempts')||jsonb_build_array(jsonb_build_object('actor',player,'round',round_i,'score',score_i,'at',at_i,'board',b)));
  s:=s||jsonb_build_object('board',NULL,'deck',NULL,'segmentStartedAt',NULL);
  advanced:=true;turn_i:=turn_i+1;IF turn_i=2 THEN turn_i:=0;round_i:=round_i+1;END IF;
  WHILE round_i>(cfg->>'stages')::integer LOOP
   IF round_i>(cfg->>'stages')::integer+(cfg->>'maxBonusStages')::integer THEN s:=jsonb_set(s,'{completed}','true');EXIT;END IF;
   EXIT WHEN public.delayed_tri_core('eligible',cfg,(s->'totals'->>(s->'players'->>turn_i))::bigint)='true'::jsonb;
   turn_i:=turn_i+1;IF turn_i=2 THEN turn_i:=0;round_i:=round_i+1;END IF;
  END LOOP;
  s:=s||jsonb_build_object('turn',turn_i,'round',round_i);
  IF (s->>'completed')::boolean THEN
   s:=jsonb_set(s,'{winner}',coalesce(CASE
    WHEN (s->'totals'->>(s->'players'->>0))::bigint>(s->'totals'->>(s->'players'->>1))::bigint THEN s->'players'->0
    WHEN (s->'totals'->>(s->'players'->>1))::bigint>(s->'totals'->>(s->'players'->>0))::bigint THEN s->'players'->1 END,'null'::jsonb));
  END IF;
 END IF;
 RETURN jsonb_build_object('state',s,'advanced',advanced,'at',at_i);
END $$;

CREATE OR REPLACE FUNCTION private.delayed_tri_project(r jsonb, viewer uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s jsonb:=r->'state'; a jsonb; p text; paired integer; totals jsonb:='{}'; pending jsonb:='{}';
 own_results jsonb:='[]'; board_i jsonb; total_i bigint; pending_i integer; disclosed boolean;
BEGIN
 IF s IS NULL OR s='null'::jsonb THEN
  s:=jsonb_build_object('players',jsonb_build_array(r->'organizer',r->'opponent'),'round',1,'attempts','[]'::jsonb);
 END IF;
 SELECT min(n) INTO paired FROM (SELECT (SELECT count(*) FROM jsonb_array_elements(s->'attempts') attempt(value) WHERE attempt.value->>'actor'=person.id) n FROM jsonb_array_elements_text(s->'players') person(id)) q;
 FOR p IN SELECT jsonb_array_elements_text(s->'players') LOOP
  total_i:=0;pending_i:=0;
  FOR a IN SELECT value FROM jsonb_array_elements(s->'attempts') LOOP
   IF a->>'actor'<>p THEN CONTINUE;END IF;
   disclosed:=p=viewer::text OR CASE WHEN r ? 'reviewed' THEN (r->'reviewed') ? (p||':'||(a->>'round')) ELSE (r->>'terminal')::boolean OR (a->>'round')::integer<=paired END;
   IF disclosed THEN total_i:=total_i+(a->>'score')::bigint;ELSE pending_i:=pending_i+1;END IF;
  END LOOP;
  totals:=totals||jsonb_build_object(p,total_i);pending:=pending||jsonb_build_object(p,pending_i);
 END LOOP;
 IF r->>'actor'=viewer::text AND nullif(s->'board','null') IS NOT NULL THEN board_i:=public.delayed_tri_core('visible',NULL,0,s->'board');END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(s->'attempts') WHERE value->>'actor'=viewer::text LOOP
  own_results:=own_results||jsonb_build_array(jsonb_build_object('round',a->'round','score',a->'score','at',a->'at','result',a#>'{board,result}','board',public.delayed_tri_core('visible',NULL,0,a->'board')));
 END LOOP;
 RETURN jsonb_build_object('id',r->'id','matchId',r->'match_id','game',r->'game_type','config',r->'config','revision',r->'revision','segment',r->'segment','actor',r->'actor',
  'round',s->'round','board',board_i,'totals',totals,'pendingResults',pending,'reviewRevision',coalesce(jsonb_array_length(r->'reviewed'),0),'terminal',r->'terminal','held',r->'held',
  'expiresAt',r->'expires_at','serverAt',r->'server_at','holeResults','[]'::jsonb,'ownResults',own_results,
  'winner',CASE WHEN (r->>'terminal')::boolean THEN r#>'{outcome,winner}' END,
  'result',CASE WHEN (r->>'terminal')::boolean AND nullif(r->'outcome','null') IS NOT NULL THEN jsonb_build_object('reason',r#>'{outcome,reason}','winner',r#>'{outcome,winner}',
   'delta',CASE WHEN viewer::text=r->>'organizer' THEN r#>'{outcome,organizer_delta}' ELSE r#>'{outcome,opponent_delta}' END) END);
END $$;

CREATE OR REPLACE FUNCTION public.delayed_tri_step(p_child uuid,p_actor uuid,p_request uuid DEFAULT NULL,p_revision bigint DEFAULT NULL,p_segment bigint DEFAULT NULL,p_intent jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; next_i jsonb; result_i jsonb; fingerprint jsonb; reviewed jsonb; due_i bigint;
 i integer; stale boolean:=false; action_i text:=p_intent->>'type';
BEGIN
 IF p_actor IS NULL OR p_child IS NULL THEN RAISE EXCEPTION 'delayed:invalid_request';END IF;
 IF p_intent IS NOT NULL AND (p_request IS NULL OR p_revision IS NULL OR p_segment IS NULL OR p_revision<0 OR p_segment<1
  OR action_i IS NULL OR action_i NOT IN('start','remove','draw','take_score')
  OR (action_i='remove' AND (jsonb_typeof(p_intent->'index') IS DISTINCT FROM 'number' OR (p_intent->>'index')::numeric<>trunc((p_intent->>'index')::numeric) OR (p_intent->>'index')::integer NOT BETWEEN 0 AND 27))) THEN RAISE EXCEPTION 'delayed:invalid_command';END IF;
 IF p_intent IS NULL AND (p_request IS NOT NULL OR p_revision IS NOT NULL OR p_segment IS NOT NULL) THEN RAISE EXCEPTION 'delayed:invalid_request';END IF;
 -- Same ordering as commit: global shared lock, request lock, match, child.
 PERFORM pg_advisory_xact_lock_shared(731907241);
 IF p_request IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text||p_request::text,319));END IF;
 r:=public.delayed_load(p_child,p_actor,p_request);
 IF r->>'game_type'<>'tri-towers' THEN RAISE EXCEPTION 'delayed:wrong_game';END IF;
 reviewed:=r->'reviewed';
 fingerprint:=jsonb_build_object('child',p_child,'revision',p_revision,'segment',p_segment,'intent',p_intent);
 IF nullif(r->'receipt','null') IS NOT NULL THEN
  IF r#>>'{receipt,child_id}' IS DISTINCT FROM p_child::text OR r#>'{receipt,fingerprint}' IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'delayed:request_conflict';END IF;
  RETURN private.delayed_tri_project(r,p_actor);
 END IF;
 -- Tick recovery is committed even when a subsequently stale action is rejected.
 FOR i IN 1..9 LOOP
  due_i:=least(floor(extract(epoch FROM (r->>'expires_at')::timestamptz)*1000)::bigint,(r#>>'{state,board,deadline}')::bigint);
  EXIT WHEN (r->>'terminal')::boolean OR (r->>'held')::boolean OR due_i>(r->>'server_at')::bigint;
  IF i=9 THEN RAISE EXCEPTION 'delayed:recovery_incomplete';END IF;
  next_i:=private.delayed_tri_transition(r,'{"type":"tick"}');
  result_i:=public.delayed_commit(p_child,p_actor,(r->>'revision')::bigint,next_i->'state','tick',(next_i->>'at')::bigint,(next_i->>'advanced')::boolean);
  r:=(result_i->'record')||jsonb_build_object('reviewed',reviewed);
 END LOOP;
 IF p_intent IS NOT NULL THEN
  IF (r->>'held')::boolean THEN RAISE EXCEPTION 'delayed:held';END IF;
  IF (r->>'terminal')::boolean OR r->>'actor'<>p_actor::text OR (r->>'revision')::bigint<>p_revision OR (r->>'segment')::integer<>p_segment THEN RETURN jsonb_build_object('error','delayed:stale_action');END IF;
  next_i:=private.delayed_tri_transition(r,p_intent);
  result_i:=public.delayed_commit(p_child,p_actor,p_revision,next_i->'state','action',(next_i->>'at')::bigint,(next_i->>'advanced')::boolean,p_request,fingerprint);
  IF result_i->>'outcome' NOT IN('committed','duplicate') THEN
   -- The boundary can expire during SQL execution. Reuse this operation's state
   -- recovery without recording the rejected request or rolling back the tick.
   PERFORM public.delayed_tri_step(p_child,p_actor);
   RETURN jsonb_build_object('error','delayed:stale_action');
  END IF;
  r:=(result_i->'record')||jsonb_build_object('reviewed',reviewed);
 END IF;
 RETURN private.delayed_tri_project(r,p_actor);
END $$;
REVOKE ALL ON FUNCTION private.delayed_tri_transition(jsonb,jsonb),private.delayed_tri_project(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.delayed_tri_step(uuid,uuid,uuid,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delayed_tri_step(uuid,uuid,uuid,bigint,bigint,jsonb) TO service_role;
