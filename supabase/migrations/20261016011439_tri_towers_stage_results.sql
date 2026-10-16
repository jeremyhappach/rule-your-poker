-- TriTowers stage presentation and Take Score. No row, financial or admission changes.
BEGIN;
SET LOCAL lock_timeout='100ms';
SET LOCAL statement_timeout='10s';
CREATE OR REPLACE FUNCTION private.tri_towers_finish_stage(s jsonb,reason text,bonus integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; stage_i integer:=(s->>'stage')::integer;
 before_i integer; total_i integer:=(s->>'score')::integer+bonus; result jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=stage_i) THEN RAISE EXCEPTION 'tri_towers:stage_already_final';END IF;
 SELECT coalesce((SELECT (r->>'score')::integer FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer<stage_i ORDER BY (r->>'stage')::integer DESC LIMIT 1),0) INTO before_i;
 result:=jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,stage_i),
  'playerId',player,'stage',stage_i,'score',total_i,'scoreBefore',before_i,'stageScore',total_i-before_i,
  'timeBonus',bonus,'reason',reason,'completedAt',at_ms,
  'finishTurn',reason IN ('timeout','give_up') OR NOT(stage_i<(s#>>'{rules,stages}')::integer OR(stage_i=(s#>>'{rules,stages}')::integer AND total_i>=(s#>>'{rules,bonusThreshold}')::integer)));
 RETURN s||jsonb_build_object('score',total_i,'stages',(s->'stages')||jsonb_build_array(result),'phase','stage_complete',
  'deadline',at_ms+(s#>>'{rules,holdMs}')::bigint,'event',jsonb_build_object('label',CASE reason WHEN 'cleared' THEN 'All Three Towers Cleared!' WHEN 'take_score' THEN 'Score taken' WHEN 'timeout' THEN 'Time expired' WHEN 'give_up' THEN 'Turn given up' ELSE 'Stage complete' END,'points',bonus));
END $$;

CREATE OR REPLACE FUNCTION private.tri_towers_reduce(s jsonb,action text,idx integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE phase text:=s->>'phase'; points integer:=0; cursor_i integer:=(s->>'cursor')::integer; cleared boolean;
 player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; stage_i integer:=(s->>'stage')::integer; run_i integer;
BEGIN
 IF phase='complete' THEN RAISE EXCEPTION 'tri_towers:complete'; END IF;
 -- A committed result is immutable. Legacy Continue/Give Up cannot shorten its hold.
 IF phase='stage_complete' THEN
  IF at_ms<(s->>'deadline')::bigint THEN
   IF action IN ('tick','continue') THEN RETURN s;END IF;
   RAISE EXCEPTION 'tri_towers:phase';
  END IF;
  IF coalesce((s->'stages'->-1->>'finishTurn')::boolean,
   NOT(stage_i<(s#>>'{rules,stages}')::integer OR(stage_i=(s#>>'{rules,stages}')::integer AND (s->>'score')::integer>=(s#>>'{rules,bonusThreshold}')::integer))) THEN
   RETURN private.tri_towers_finish_player(s,at_ms);
  END IF;
  RETURN private.tri_towers_deal(s||jsonb_build_object('stage',stage_i+1),at_ms)||jsonb_build_object('phase','playing',
   'deadline',at_ms+(s#>>'{rules,stageMs}')::bigint,'event',jsonb_build_object('label','Stage started','points',0));
 END IF;
 IF at_ms>=(s->>'deadline')::bigint OR action='give_up' THEN
  IF phase='playing' THEN RETURN private.tri_towers_finish_stage(s,CASE WHEN at_ms>=(s->>'deadline')::bigint THEN 'timeout' ELSE 'give_up' END,0,at_ms);END IF;
  RETURN private.tri_towers_finish_player(s,at_ms);
 END IF;
 IF action='tick' THEN RETURN s; END IF;
 IF phase='ready' AND action='start' THEN RETURN s||jsonb_build_object('phase','playing','deadline',at_ms+(s#>>'{rules,stageMs}')::bigint,'event',jsonb_build_object('label','Stage started','points',0)); END IF;
 IF phase<>'playing' THEN RAISE EXCEPTION 'tri_towers:phase'; END IF;
 IF action='take_score' THEN RETURN private.tri_towers_finish_stage(s,'take_score',0,at_ms);END IF;
 IF action='remove' THEN
  IF private.tri_towers_legal(s,idx) IS DISTINCT FROM true THEN RAISE EXCEPTION 'tri_towers:illegal_move'; END IF;
  s:=s||jsonb_build_object('removed',(s->'removed')||to_jsonb(idx),'waste',s->'deck'->idx);
  run_i:=(s->>'run')::integer+1;points:=run_i*(s#>>'{rules,runStep}')::integer;
  IF idx<3 THEN points:=points+(s->'rules'->'peakBonuses'->>((SELECT count(*) FROM jsonb_array_elements_text(s->'removed') r WHERE r::integer<3)-1)::integer)::integer; END IF;
  s:=s||jsonb_build_object('run',run_i,'score',(s->>'score')::integer+points,'event',jsonb_build_object('label',CASE WHEN idx<3 THEN 'Tower cleared' ELSE 'Run '||run_i END,'points',points));
 ELSIF action='draw' THEN
  IF cursor_i>=52 THEN RAISE EXCEPTION 'tri_towers:stock_empty'; END IF;
  s:=s||jsonb_build_object('cursor',cursor_i+1,'waste',s->'deck'->cursor_i,'run',0,'event',jsonb_build_object('label','Stock drawn','points',0));
 ELSE RAISE EXCEPTION 'tri_towers:invalid_action'; END IF;
 cleared:=jsonb_array_length(s->'removed')=28;
 IF cleared OR ((s->>'cursor')::integer=52 AND NOT EXISTS(SELECT 1 FROM generate_series(0,27) i WHERE private.tri_towers_legal(s,i))) THEN
  points:=CASE WHEN cleared THEN greatest(0,((s->>'deadline')::bigint-at_ms)/1000)*(s#>>'{rules,timePerSecond}')::integer ELSE 0 END;
  RETURN private.tri_towers_finish_stage(s,CASE WHEN cleared THEN 'cleared' ELSE 'exhausted' END,points,at_ms);
 END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.tri_towers_snapshot(p_dealer_game_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.tri_towers_matches; viewer uuid; paused boolean;
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id;
 SELECT id INTO viewer FROM public.players WHERE game_id=m.game_id AND user_id=auth.uid() AND status<>'left' AND NOT is_bot;
 IF viewer IS NULL OR NOT private.tri_towers_actor_allowed(auth.uid()) THEN RAISE EXCEPTION 'tri_towers:membership_required' USING ERRCODE='42501'; END IF;
 SELECT is_paused INTO paused FROM public.games WHERE id=m.game_id;
 RETURN private.tri_towers_visible(m.state)||jsonb_build_object('revision',m.revision,'viewerId',viewer,
  'canAct',NOT coalesce(paused,false) AND m.state->>'phase'<>'complete' AND m.state->'players'->(m.state->>'turnIndex')::integer->>'id'=viewer::text,
  'serverAt',floor(extract(epoch FROM clock_timestamp())*1000),'settlement',m.settlement,'paused',coalesce(paused,false),'finished',m.finished)
  -- Add new presentation metadata only with a newly committed result/revision.
  -- Existing clients compare equal revisions strictly; installation alone must not change their snapshot shape.
  ||CASE WHEN m.state->>'phase'='stage_complete' AND (m.state->'stages'->-1) ? 'id' THEN jsonb_build_object('pausedAt',m.paused_at) ELSE '{}'::jsonb END;
END $$;

CREATE OR REPLACE FUNCTION public.tri_towers_action(p_dealer_game_id uuid,p_request_id uuid,p_revision bigint,p_action text,p_index integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m private.tri_towers_matches; g public.games; actor uuid:=auth.uid(); player uuid; prior private.tri_towers_requests;
 command jsonb:=jsonb_build_object('revision',p_revision,'action',p_action,'index',p_index); at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000);
BEGIN
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id;
 PERFORM 1 FROM public.rounds WHERE id=m.round_id FOR UPDATE;
 SELECT * INTO STRICT g FROM public.games WHERE id=m.game_id FOR UPDATE;
 SELECT * INTO STRICT m FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id FOR UPDATE;
 SELECT id INTO player FROM public.players WHERE game_id=m.game_id AND user_id=actor AND status<>'left' AND NOT is_bot;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF player IS NULL OR NOT private.tri_towers_actor_allowed(actor) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(m.state->'players') p WHERE p->>'id'=player::text) THEN RAISE EXCEPTION 'tri_towers:participant_required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR p_revision IS NULL OR p_action IS NULL OR p_action NOT IN ('start','remove','draw','continue','give_up','take_score') THEN RAISE EXCEPTION 'tri_towers:invalid_command'; END IF;
 SELECT * INTO prior FROM private.tri_towers_requests WHERE dealer_game_id=p_dealer_game_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>actor OR prior.command<>command THEN RAISE EXCEPTION 'tri_towers:replay_conflict'; END IF;
  RETURN public.tri_towers_snapshot(p_dealer_game_id);
 END IF;
 IF g.real_money IS DISTINCT FROM false OR g.current_game_uuid IS DISTINCT FROM m.dealer_game_id OR g.game_type IS DISTINCT FROM 'tri-towers' OR g.status<>'in_progress' OR m.finished OR g.is_paused THEN RAISE EXCEPTION 'tri_towers:inactive'; END IF;
 IF m.revision<>p_revision THEN RAISE EXCEPTION 'tri_towers:stale_revision'; END IF;
 IF m.state->'players'->(m.state->>'turnIndex')::integer->>'id' IS DISTINCT FROM player::text THEN RAISE EXCEPTION 'tri_towers:spectator' USING ERRCODE='42501'; END IF;
 m.state:=private.tri_towers_reduce(m.state,p_action,p_index,at_ms);
 INSERT INTO private.tri_towers_requests VALUES(m.dealer_game_id,p_request_id,actor,command);
 UPDATE private.tri_towers_matches SET state=m.state,revision=revision+1 WHERE dealer_game_id=m.dealer_game_id;
 IF m.state->>'phase'='complete' THEN PERFORM private.tri_towers_settle(m.dealer_game_id); END IF;
 RETURN public.tri_towers_snapshot(m.dealer_game_id);
END $$;
REVOKE ALL ON FUNCTION private.tri_towers_finish_stage(jsonb,text,integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
