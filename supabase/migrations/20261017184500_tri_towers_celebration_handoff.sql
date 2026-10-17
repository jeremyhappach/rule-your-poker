-- Dedicated celebration before the unchanged result hold. New admission stays disabled.
ALTER TABLE private.tri_towers_release ADD COLUMN IF NOT EXISTS celebration_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION private.tri_towers_rules()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN celebration_enabled THEN '{"wrap":true,"holdMs":5000,"stages":2,"readyMs":30000,"stageMs":120000,"version":"tri-towers/4","drawPenalty":100,"peakBonuses":[5000,10000,15000],"roundIntroMs":2500,"stockPerCard":1000,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"timePerSecond":10,"bonusThreshold":80000,"maxBonusStages":1,"clearCelebrationMs":3000}'::jsonb WHEN intro_enabled THEN '{"version":"tri-towers/3","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"drawPenalty":100,"peakBonuses":[5000,10000,15000],"stageMs":120000,"readyMs":30000,"holdMs":5000,"timePerSecond":10,"stockPerCard":1000,"wrap":true,"roundIntroMs":2500}'::jsonb ELSE '{"version":"tri-towers/2","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"drawPenalty":100,"peakBonuses":[5000,10000,15000],"stageMs":120000,"readyMs":30000,"holdMs":5000,"timePerSecond":10,"stockPerCard":1000,"wrap":true}'::jsonb END FROM private.tri_towers_release WHERE singleton
$function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_board_deal(b jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 b:=private.tri_towers_board_deal_v2(b,at_ms);
 IF b#>>'{rules,version}' IN ('tri-towers/3','tri-towers/4') THEN b:=b||jsonb_build_object('phase','intro','deadline',at_ms+(b#>>'{rules,roundIntroMs}')::bigint);END IF;
 RETURN b;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE totals jsonb;
BEGIN
 IF s#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3','tri-towers/4') THEN RETURN private.tri_towers_deal_v1(s,at_ms);END IF;
 SELECT jsonb_object_agg(p->>'id',coalesce(s->'scores'->(p->>'id'),'0'::jsonb)) INTO totals FROM jsonb_array_elements(s->'players') p;
 RETURN private.tri_towers_board_deal(s||jsonb_build_object('scores',totals,'score',coalesce(totals->(s->'players'->(s->>'turnIndex')::integer->>'id'),'0'::jsonb)),at_ms);
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_reduce(s jsonb, action text, idx integer, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE board jsonb; player text:=s->'players'->(s->>'turnIndex')::integer->>'id'; next_i integer:=(s->>'turnIndex')::integer+1;
 round_i integer:=(s->>'stage')::integer; n integer:=jsonb_array_length(s->'players'); qualified jsonb; result jsonb;
BEGIN
 IF s#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3','tri-towers/4') THEN RETURN private.tri_towers_reduce_v1(s,action,idx,at_ms);END IF;
 IF s->>'phase'='complete' THEN RAISE EXCEPTION 'tri_towers:complete';END IF;
 IF s->>'phase'='stage_complete' THEN
  IF action NOT IN ('tick','continue') THEN RAISE EXCEPTION 'tri_towers:phase';END IF;
  IF at_ms<(s->>'deadline')::bigint THEN RETURN s;END IF;
  IF next_i>=n AND round_i<2 THEN next_i:=0;round_i:=round_i+1;
  ELSIF next_i>=n AND round_i=2 THEN
   SELECT coalesce(jsonb_agg(p->>'id' ORDER BY ord),'[]'::jsonb) INTO qualified FROM jsonb_array_elements(s->'players') WITH ORDINALITY a(p,ord)
    WHERE private.tri_towers_bonus_qualified_v2((s->'scores'->>(p->>'id'))::bigint,s->'rules');
   s:=s||jsonb_build_object('qualified',qualified);round_i:=3;next_i:=0;
  END IF;
  IF round_i=3 THEN
   WHILE next_i<n AND NOT coalesce(s->'qualified','[]'::jsonb) ? (s->'players'->next_i->>'id') LOOP next_i:=next_i+1;END LOOP;
  END IF;
  IF next_i>=n THEN RETURN s||jsonb_build_object('phase','complete','deadline',0,'turnIndex',n,'event',jsonb_build_object('label','Competition complete','points',0));END IF;
  RETURN private.tri_towers_deal(s||jsonb_build_object('turnIndex',next_i,'stage',round_i),at_ms);
 END IF;
 -- Board operations do not own or inspect the multiplayer schedule.
 board:=s-ARRAY['players','scores','stages','qualified','turnIndex','stage','identity'];
 board:=private.tri_towers_board_reduce(board,action,idx,at_ms);
 s:=s||board;
 s:=jsonb_set(s,ARRAY['scores',player],s->'score');
 IF s->>'phase'='stage_complete' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'stages') r WHERE r->>'playerId'=player AND (r->>'stage')::integer=round_i) THEN RAISE EXCEPTION 'tri_towers:stage_already_final';END IF;
  result:=s->'result'||jsonb_build_object('id',concat_ws(':',s#>>'{identity,dealerGameId}',s#>>'{identity,roundId}',player,round_i),'playerId',player,'stage',round_i);
  s:=s||jsonb_build_object('stages',(s->'stages')||jsonb_build_array(result));
 END IF;
 RETURN s;
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_bot_choice(v jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE i integer; best_i integer; value_i integer; best_value integer:=-1; next_points integer; peaks integer; r jsonb; uncovered integer;
BEGIN
 IF v ? 'deck' THEN RAISE EXCEPTION 'tri_towers:bot_private_input';END IF;
 IF v#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3','tri-towers/4') THEN RETURN private.tri_towers_bot_choice_v1(v,at_ms);END IF;
 IF v->>'phase' NOT IN ('ready','playing') THEN RETURN NULL;END IF;
 IF v->>'phase'='playing' AND (v->>'deadline')::bigint-at_ms<=2500 THEN RETURN jsonb_build_object('action','take_score');END IF;
 next_points:=(v->'rules'->'streakAwards'->>least((v->>'run')::integer,jsonb_array_length(v#>'{rules,streakAwards}')-1))::integer;
 FOR i IN 0..27 LOOP
  IF v->'cards'->i IS NULL OR v->'cards'->i='null'::jsonb OR v->'removed' @> to_jsonb(i) THEN CONTINUE;END IF;
  IF abs((v->'cards'->>i)::integer%13-(v->>'waste')::integer%13) NOT IN (1,12) THEN CONTINUE;END IF;
  r:=v||jsonb_build_object('removed',(v->'removed')||to_jsonb(i));
  SELECT count(*) INTO uncovered FROM generate_series(0,27) x WHERE private.tri_towers_exposed(r,x) AND NOT private.tri_towers_exposed(v,x);
  value_i:=next_points+uncovered*200;
  IF i<3 THEN SELECT count(*) INTO peaks FROM jsonb_array_elements_text(v->'removed') p WHERE p::integer<3;value_i:=value_i+(v->'rules'->'peakBonuses'->>peaks)::integer;END IF;
  IF value_i>best_value THEN best_value:=value_i;best_i:=i;END IF;
 END LOOP;
 IF best_i IS NOT NULL THEN RETURN jsonb_build_object('action','remove','index',best_i);END IF;
 RETURN jsonb_build_object('action',CASE WHEN (v->>'stockRemaining')::integer>0 THEN 'draw' ELSE 'take_score' END);
END $function$
;
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text, ruleset text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3','tri-towers/4') THEN 'tri-towers/2' ELSE ruleset END
$function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_present(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF (SELECT state#>>'{rules,version}' FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id) IN ('tri-towers/3','tri-towers/4') THEN
  PERFORM public.tri_towers_snapshot(p_dealer_game_id);
  RAISE EXCEPTION 'TriTowers updated. Refresh to continue.';
 END IF;
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i);
END $function$
;
CREATE OR REPLACE FUNCTION private.tri_towers_board_reduce(b jsonb, action text, idx integer, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
 IF b#>>'{rules,version}' IN ('tri-towers/3','tri-towers/4') AND b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN
   IF action='tick' THEN RETURN b;END IF;
   RAISE EXCEPTION 'tri_towers:round_intro';
  END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint);
 END IF;
 b:=private.tri_towers_board_reduce_v2(b,action,idx,at_ms);
 IF b#>>'{rules,version}'='tri-towers/4' AND b->>'phase'='stage_complete' AND b#>>'{result,reason}'='cleared' THEN
  -- Absolute result identity/time, never additive: replay cannot extend the hold.
  b:=jsonb_set(b,'{deadline}',to_jsonb((b#>>'{result,completedAt}')::bigint+(b#>>'{rules,holdMs}')::bigint+(b#>>'{rules,clearCelebrationMs}')::bigint));
 END IF;
 RETURN b;
END $function$
;
CREATE OR REPLACE FUNCTION private.arcade_tri_projection(run private.arcade_runs, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE s jsonb:=run.state; b jsonb:=s->'board'; v jsonb; result jsonb:=s->'results'->-1;
BEGIN
 v:=private.tri_towers_visible(b)-ARRAY['activePlayerId','cursor'];
 SELECT jsonb_object_agg(k,v->k) INTO v FROM unnest(ARRAY['rules','phase','cards','removed','waste','run','score','deadline','event','stockRemaining']) k;
 RETURN jsonb_build_object('id',run.id,'game',run.game,'ruleset',run.ruleset,'revision',run.revision,'status',run.status,
  'serverAt',at_ms,'score',run.score,'dueAt',run.due_at,'events','[]'::jsonb,
  'highRun',private.arcade_tri_high_run(run),
  'completion',(SELECT record FROM private.arcade_results WHERE run_id=run.id),
  'view',v||jsonb_build_object('roundId',s->>'roundId','round',s->'round','result',CASE WHEN b->>'phase'='stage_complete' THEN result ELSE NULL END,
   'scorePresentation',CASE WHEN b->>'phase'='stage_complete' THEN jsonb_build_object('startedAt',CASE WHEN run.ruleset='tri-towers/4' THEN (result->>'completedAt')::bigint ELSE (b->>'deadline')::bigint-(run.config->>'holdMs')::bigint END,
    'endsAt',(b->>'deadline')::bigint,'from',result->'scoreBefore','to',result->'score') ELSE NULL END));
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_present_celebration(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i)||CASE WHEN v#>>'{rules,version}' IN ('tri-towers/3','tri-towers/4') THEN jsonb_build_object('pausedAt',(SELECT paused_at FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)) ELSE '{}'::jsonb END;
END $function$
;
CREATE OR REPLACE FUNCTION public.tri_towers_present_scene(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF (SELECT state#>>'{rules,version}' FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)='tri-towers/4' THEN
  PERFORM public.tri_towers_snapshot(p_dealer_game_id);
  RAISE EXCEPTION 'TriTowers updated. Refresh to continue.';
 END IF;
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i)||CASE WHEN v#>>'{rules,version}'='tri-towers/3' THEN jsonb_build_object('pausedAt',(SELECT paused_at FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)) ELSE '{}'::jsonb END;
END $function$
;
REVOKE ALL ON FUNCTION public.tri_towers_present_celebration(uuid,uuid,bigint,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tri_towers_present_celebration(uuid,uuid,bigint,text,integer) TO authenticated;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('tri-towers/4','tri-towers','{"wrap":true,"holdMs":5000,"stages":2,"readyMs":30000,"stageMs":120000,"version":"tri-towers/4","drawPenalty":100,"peakBonuses":[5000,10000,15000],"roundIntroMs":2500,"stockPerCard":1000,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"timePerSecond":10,"bonusThreshold":80000,"maxBonusStages":1,"clearCelebrationMs":3000}',false) ON CONFLICT(id) DO NOTHING;
