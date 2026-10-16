CREATE OR REPLACE FUNCTION private.tri_towers_deal_v1(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE deck jsonb:=private.tri_towers_shuffle();
BEGIN
 RETURN s||jsonb_build_object('deck',deck,'removed','[]'::jsonb,'cursor',29,'waste',deck->28,'run',0,'phase','ready',
   'deadline',at_ms+(s#>>'{rules,readyMs}')::bigint,'event',jsonb_build_object('label','Ready','points',0));
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_reduce_v1(s jsonb, action text, idx integer, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_bot_choice_v1(v jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE i integer; j integer; k integer; r jsonb; rr jsonb; uncovered integer; options integer; followups integer;
 value_i integer; best_value integer:=-1; best_i integer; rank_i integer; peak_count integer;
BEGIN
 IF v ? 'deck' THEN RAISE EXCEPTION 'tri_towers:bot_private_input';END IF;
 IF v->>'phase'='ready' THEN RETURN jsonb_build_object('action','start');END IF;
 IF v->>'phase'<>'playing' THEN RETURN NULL;END IF;
 -- Points cannot be lost by drawing. Bank before timeout forfeits later stages.
 IF (v->>'deadline')::bigint-at_ms<=5000 THEN RETURN jsonb_build_object('action','take_score');END IF;
 FOR i IN 0..27 LOOP
  IF v->'cards'->i='null'::jsonb OR v->'cards'->i IS NULL OR v->'removed' @> to_jsonb(i) THEN CONTINUE;END IF;
  rank_i:=(v->'cards'->>i)::integer%13;
  IF abs(rank_i-(v->>'waste')::integer%13) NOT IN (1,12) THEN CONTINUE;END IF;
  r:=v||jsonb_build_object('removed',(v->'removed')||to_jsonb(i));
  SELECT count(*) INTO uncovered FROM generate_series(0,27) x WHERE private.tri_towers_exposed(r,x) AND NOT private.tri_towers_exposed(v,x);
  options:=0;followups:=0;
  FOR j IN 0..27 LOOP
   IF j=i OR v->'cards'->j='null'::jsonb OR v->'cards'->j IS NULL OR v->'removed' @> to_jsonb(j) THEN CONTINUE;END IF;
   IF abs((v->'cards'->>j)::integer%13-rank_i) NOT IN (1,12) THEN CONTINUE;END IF;
   options:=options+1;
   rr:=r||jsonb_build_object('removed',(r->'removed')||to_jsonb(j));
   SELECT count(*) INTO k FROM generate_series(0,27) x
    WHERE x<>i AND x<>j AND v->'cards'->x<>'null'::jsonb AND private.tri_towers_exposed(rr,x)
     AND abs((v->'cards'->>x)::integer%13-(v->'cards'->>j)::integer%13) IN (1,12);
   followups:=greatest(followups,k);
  END LOOP;
  value_i:=((v->>'run')::integer+1)*(v#>>'{rules,runStep}')::integer+uncovered*2000+options*900+followups*400;
  IF i<3 THEN
   SELECT count(*) INTO peak_count FROM jsonb_array_elements_text(v->'removed') x WHERE x::integer<3;
   value_i:=value_i+(v->'rules'->'peakBonuses'->>peak_count)::integer;
  END IF;
  IF value_i>best_value THEN best_value:=value_i;best_i:=i;END IF;
 END LOOP;
 IF best_i IS NOT NULL THEN RETURN jsonb_build_object('action','remove','index',best_i);END IF;
 RETURN jsonb_build_object('action',CASE WHEN (v->>'stockRemaining')::integer>0 THEN 'draw' ELSE 'take_score' END);
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_snapshot_v1(p_dealer_game_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$
;
