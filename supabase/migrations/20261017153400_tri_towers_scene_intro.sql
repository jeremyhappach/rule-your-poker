-- Shared lifecycle version. Scoring, dealing and financial reducers remain unchanged.
ALTER TABLE private.tri_towers_release ADD COLUMN IF NOT EXISTS intro_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION private.tri_towers_rules() RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN intro_enabled THEN '{"version":"tri-towers/3","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"drawPenalty":100,"peakBonuses":[5000,10000,15000],"stageMs":120000,"readyMs":30000,"holdMs":5000,"timePerSecond":10,"stockPerCard":1000,"wrap":true,"roundIntroMs":2500}'::jsonb ELSE '{"version":"tri-towers/2","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"drawPenalty":100,"peakBonuses":[5000,10000,15000],"stageMs":120000,"readyMs":30000,"holdMs":5000,"timePerSecond":10,"stockPerCard":1000,"wrap":true}'::jsonb END FROM private.tri_towers_release WHERE singleton
$$;
CREATE OR REPLACE FUNCTION private.tri_towers_board_deal(b jsonb,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 b:=private.tri_towers_board_deal_v2(b,at_ms);
 IF b#>>'{rules,version}'='tri-towers/3' THEN b:=b||jsonb_build_object('phase','intro','deadline',at_ms+(b#>>'{rules,roundIntroMs}')::bigint);END IF;
 RETURN b;
END $$;
CREATE OR REPLACE FUNCTION private.tri_towers_board_reduce(b jsonb,action text,idx integer,at_ms bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF b#>>'{rules,version}'='tri-towers/3' AND b->>'phase'='intro' THEN
  IF at_ms<(b->>'deadline')::bigint THEN
   IF action='tick' THEN RETURN b;END IF;
   RAISE EXCEPTION 'tri_towers:round_intro';
  END IF;
  b:=b||jsonb_build_object('phase','ready','deadline',(b->>'deadline')::bigint+(b#>>'{rules,readyMs}')::bigint);
 END IF;
 RETURN private.tri_towers_board_reduce_v2(b,action,idx,at_ms);
END $$;
REVOKE ALL ON FUNCTION private.tri_towers_board_deal(jsonb,bigint),private.tri_towers_board_reduce(jsonb,text,integer,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.tri_towers_deal(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE totals jsonb;
BEGIN
 IF s#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3') THEN RETURN private.tri_towers_deal_v1(s,at_ms);END IF;
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
 IF s#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3') THEN RETURN private.tri_towers_reduce_v1(s,action,idx,at_ms);END IF;
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
 IF v#>>'{rules,version}'NOT IN ('tri-towers/2','tri-towers/3') THEN RETURN private.tri_towers_bot_choice_v1(v,at_ms);END IF;
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
CREATE OR REPLACE FUNCTION public.arcade_tri_step(p_actor uuid, p_run uuid, p_revision bigint DEFAULT NULL::bigint, p_round text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;s jsonb;next_s jsonb;receipt private.arcade_command_receipts;fingerprint text;
 at_ms bigint;outcome text:='current';committed jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF p_action IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR run.game<>'tri-towers' OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 at_ms:=floor(extract(epoch FROM clock_timestamp())*1000);
 IF p_action IS NOT NULL THEN
  IF p_request IS NULL OR p_revision IS NULL OR p_round IS NULL OR p_action NOT IN('remove','draw','take_score','abandon') THEN RAISE EXCEPTION 'arcade:invalid_command';END IF;
  fingerprint:=jsonb_build_array(p_run,p_revision,p_round,p_action,p_index)::text;
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run),'projection',private.arcade_tri_projection(run,at_ms));
  END IF;
 END IF;
 s:=run.state;
 IF run.status='active' THEN
  IF s IS NULL THEN
   s:=jsonb_build_object('runId',run.id,'userId',run.user_id,'config',run.config,'round',1,'roundId',run.id||':1','status','active','score',0,'results','[]'::jsonb,
    'board',private.tri_towers_board_deal(jsonb_build_object('rules',run.config,'score',0),floor(extract(epoch FROM run.created_at)*1000)::bigint));
  END IF;
  next_s:=private.arcade_tri_advance(s,at_ms);
  IF next_s IS DISTINCT FROM run.state THEN
   committed:=public.arcade_commit(p_actor,run.id,run.revision,next_s,(next_s#>>'{board,deadline}')::bigint,NULL,NULL,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;
  END IF;
 END IF;
 IF p_action IS NOT NULL THEN
  IF run.status<>'active' OR run.revision<>p_revision OR run.state->>'roundId' IS DISTINCT FROM p_round THEN outcome:='stale';
  ELSE
   s:=run.state;
   IF p_action='abandon' THEN s:=s||jsonb_build_object('status','abandoned');
   ELSE
    s:=jsonb_set(s,'{board}',private.tri_towers_board_reduce(s->'board',p_action,p_index,at_ms));
    s:=s||jsonb_build_object('score',s#>'{board,score}');s:=private.arcade_tri_finish_round(s);
   END IF;
   committed:=public.arcade_commit(p_actor,run.id,run.revision,s,(s#>>'{board,deadline}')::bigint,p_request,fingerprint,p_token);
   SELECT * INTO run FROM private.arcade_runs WHERE id=p_run;outcome:='committed';
  END IF;
 END IF;
 RETURN jsonb_build_object('outcome',outcome,'record',private.arcade_record(run),'projection',private.arcade_tri_projection(run,at_ms));
END $function$
;
CREATE OR REPLACE FUNCTION private.arcade_tri_advance(s jsonb, at_ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE due bigint; round_i integer; i integer;
BEGIN
 FOR i IN 1..9 LOOP
  EXIT WHEN s->>'status'<>'active';
  due:=(s#>>'{board,deadline}')::bigint;EXIT WHEN due>at_ms;
  IF s#>>'{board,phase}'='stage_complete' THEN
   round_i:=(s->>'round')::integer+1;
   s:=s||jsonb_build_object('round',round_i,'roundId',(s->>'runId')||':'||round_i,
    'board',private.tri_towers_board_deal(jsonb_build_object('rules',s->'config','score',s->'score'),due));
  ELSE
   s:=jsonb_set(s,'{board}',private.tri_towers_board_reduce(s->'board','tick',NULL,due));
   s:=private.arcade_tri_finish_round(s);
  END IF;
 END LOOP;
 RETURN s;
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
 IF p_action IS NULL THEN v:=public.tri_towers_snapshot(p_dealer_game_id);
 ELSE v:=public.tri_towers_action(p_dealer_game_id,p_request_id,p_revision,p_action,p_index);END IF;
 SELECT greatest(coalesce(max((frame->>'run')::integer),0),coalesce((v->>'run')::integer,0)) INTO high_i
 FROM private.tri_towers_history WHERE dealer_game_id=p_dealer_game_id AND revision<=(v->>'revision')::bigint
  AND frame#>>'{identity,roundId}'=v#>>'{identity,roundId}' AND frame->>'stage'=v->>'stage'
  AND frame->>'activePlayerId'=v->>'activePlayerId';
 RETURN v||jsonb_build_object('highRun',high_i)||CASE WHEN v#>>'{rules,version}'='tri-towers/3' THEN jsonb_build_object('pausedAt',(SELECT paused_at FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)) ELSE '{}'::jsonb END;
END $function$
;
REVOKE ALL ON FUNCTION public.tri_towers_present_scene(uuid,uuid,bigint,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tri_towers_present_scene(uuid,uuid,bigint,text,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.tri_towers_present(p_dealer_game_id uuid, p_request_id uuid DEFAULT NULL::uuid, p_revision bigint DEFAULT NULL::bigint, p_action text DEFAULT NULL::text, p_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb; high_i integer;
BEGIN
 IF (SELECT state#>>'{rules,version}' FROM private.tri_towers_matches WHERE dealer_game_id=p_dealer_game_id)='tri-towers/3' THEN
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
-- Explicit compatibility: the only v3 difference is a pre-Ready introduction.
CREATE OR REPLACE FUNCTION private.arcade_score_group(game text,ruleset text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN game='tri-towers' AND ruleset IN ('tri-towers/2','tri-towers/3') THEN 'tri-towers/2' ELSE ruleset END
$$;
REVOKE ALL ON FUNCTION private.arcade_score_group(text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.arcade_commit(p_actor uuid, p_run uuid, p_revision bigint, p_state jsonb, p_due bigint, p_request uuid DEFAULT NULL::uuid, p_fingerprint text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE run private.arcade_runs;receipt private.arcade_command_receipts;status_i text:=p_state->>'status';score_i bigint:=(p_state->>'score')::bigint;prior_best bigint;record_i jsonb;
BEGIN
 IF p_actor IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM private.arcade_recovery_state WHERE singleton AND token=p_token AND claimed AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'arcade:recovery_denied' USING ERRCODE='42501';END IF;
 ELSIF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 SELECT * INTO run FROM private.arcade_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR (p_actor IS NOT NULL AND run.user_id<>p_actor) THEN RAISE EXCEPTION 'arcade:not_found' USING ERRCODE='42501';END IF;
 IF p_request IS NOT NULL THEN
  SELECT * INTO receipt FROM private.arcade_command_receipts WHERE user_id=run.user_id AND request_id=p_request;
  IF FOUND THEN
   IF receipt.run_id<>p_run OR receipt.fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'arcade:request_conflict';END IF;
   RETURN jsonb_build_object('outcome','duplicate','record',private.arcade_record(run));
  END IF;
 END IF;
 IF run.revision<>p_revision OR run.status<>'active' THEN RETURN jsonb_build_object('outcome','conflict','record',private.arcade_record(run));END IF;
 -- A request computed before expiry may acquire this lock after expiry.
 -- Only the new clock policy changes; worker synchronization can commit its timeout.
 IF p_request IS NOT NULL AND run.config->>'clockStart'='intro_end'
  AND run.state->'board'->'result'='null'::jsonb
  AND (run.state->'board'->>'deadline')::bigint<=floor(extract(epoch FROM clock_timestamp())*1000) THEN
  RETURN jsonb_build_object('outcome','deadline','record',private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
 END IF;
 IF p_state->>'runId' IS DISTINCT FROM run.id::text OR p_state->>'userId' IS DISTINCT FROM run.user_id::text
  OR p_state->'config' IS DISTINCT FROM run.config OR status_i NOT IN('active','completed','expired','abandoned')
  OR score_i IS NULL OR score_i<0 OR (p_state->>'round')::integer NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'arcade:invalid_state';END IF;
 IF run.game='tri-towers' AND status_i='completed' AND private.arcade_tri_valid_completion(p_state) IS DISTINCT FROM true THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 IF run.game='run21' AND status_i='completed' AND ((p_state->>'round')::integer<>3 OR jsonb_array_length(p_state->'results')<>3
  OR score_i<>(SELECT sum((x->>'score')::bigint) FROM jsonb_array_elements(p_state->'results') x)) THEN RAISE EXCEPTION 'arcade:invalid_completion';END IF;
 UPDATE private.arcade_runs SET state=p_state,status=status_i,score=score_i,revision=revision+1,
  due_at=CASE WHEN status_i='active' THEN p_due END,updated_at=clock_timestamp(),
  ended_at=CASE WHEN status_i<>'active' THEN clock_timestamp() END WHERE id=p_run RETURNING * INTO run;
 IF p_request IS NOT NULL THEN INSERT INTO private.arcade_command_receipts VALUES(run.user_id,p_request,p_run,p_fingerprint,run.revision);END IF;
 IF status_i='completed' THEN
  -- One active run per user/game and the existing row lock serialize completions.
  -- Read before insertion, explicitly excluding this immutable result identity.
  SELECT max(score) INTO prior_best FROM private.arcade_results
   WHERE user_id=run.user_id AND game=run.game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(run.game,run.ruleset) AND run_id<>run.id;
  record_i:=jsonb_build_object('priorBest',prior_best,'kind',CASE
   WHEN prior_best IS NULL THEN 'first' WHEN run.score>prior_best THEN 'broken'
   WHEN run.score=prior_best THEN 'matched' ELSE 'lower' END);
  INSERT INTO private.arcade_results(run_id,user_id,game,ruleset,score,revision,completed_at,final_state,record)
   VALUES(run.id,run.user_id,run.game,run.ruleset,run.score,run.revision,run.ended_at,p_state,record_i);
 END IF;
 UPDATE public.arcade_revisions SET revision=run.revision WHERE run_id=p_run;
 RETURN jsonb_build_object('outcome','committed','record',private.arcade_record(run)||jsonb_build_object('server_at',floor(extract(epoch FROM clock_timestamp())*1000)));
END $function$
;
CREATE OR REPLACE FUNCTION public.arcade_leaderboard(p_actor uuid, p_game text, p_window text, p_result uuid DEFAULT NULL::uuid, p_ruleset text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE version_i text;current_i text;answer jsonb;
BEGIN
 IF NOT private.arcade_allowed(p_actor) THEN RAISE EXCEPTION 'arcade:forbidden' USING ERRCODE='42501';END IF;
 IF p_window NOT IN('30','all') THEN RAISE EXCEPTION 'arcade:invalid_window';END IF;
 SELECT id INTO current_i FROM private.arcade_rulesets WHERE game=p_game AND enabled ORDER BY id DESC LIMIT 1;
 version_i:=coalesce(p_ruleset,current_i);
 IF NOT EXISTS(SELECT 1 FROM private.arcade_rulesets WHERE id=version_i AND game=p_game) THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 IF version_i IS NULL THEN RAISE EXCEPTION 'arcade:unavailable';END IF;
 WITH eligible AS (
  SELECT user_id,score,completed_at,run_id FROM private.arcade_results
   WHERE game=p_game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(p_game,version_i) AND (p_window='all' OR completed_at>=statement_timestamp()-interval '30 days')
 ), ranked AS (
  SELECT b.*,rank() OVER(ORDER BY score DESC) place FROM eligible b
 ), named AS (
  SELECT jsonb_build_object('runId',r.run_id,'userId',r.user_id,'name',coalesce(p.username,'Player'),'score',r.score,'rank',r.place,'completedAt',r.completed_at) item,r.*
   FROM ranked r LEFT JOIN public.profiles p ON p.id=r.user_id
 )
 SELECT jsonb_build_object('ruleset',version_i,'currentRuleset',current_i,'compatibleRulesets',(SELECT jsonb_agg(id ORDER BY id) FROM private.arcade_rulesets WHERE game=p_game AND private.arcade_score_group(game,id)=private.arcade_score_group(p_game,version_i)),'availableRulesets',(SELECT jsonb_agg(id ORDER BY id DESC) FROM(SELECT max(id) id FROM private.arcade_rulesets WHERE game=p_game AND (p_game<>'tri-towers' OR enabled OR EXISTS(SELECT 1 FROM private.arcade_results r WHERE r.ruleset=private.arcade_rulesets.id)) GROUP BY private.arcade_score_group(game,id)) groups),
  'rows',coalesce((SELECT jsonb_agg(item ORDER BY score DESC,completed_at,run_id) FROM(SELECT * FROM named ORDER BY score DESC,completed_at,run_id LIMIT 10)t),'[]'),
  'self',(SELECT item FROM named WHERE user_id=p_actor ORDER BY score DESC,completed_at,run_id LIMIT 1),
  'personalBest',(SELECT max(score) FROM private.arcade_results WHERE user_id=p_actor AND game=p_game AND private.arcade_score_group(game,ruleset)=private.arcade_score_group(p_game,version_i)),
  'previousBests',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM(SELECT ruleset,max(score) score FROM private.arcade_results WHERE user_id=p_actor AND game=p_game AND private.arcade_score_group(game,ruleset)<>private.arcade_score_group(p_game,version_i) GROUP BY ruleset)b),'[]'),
  'activeRun',(SELECT id FROM private.arcade_runs WHERE user_id=p_actor AND game=p_game AND status='active'),
  'latestResult',(SELECT jsonb_build_object('id',id,'score',score,'status',status,'ruleset',ruleset,'rank',(SELECT place FROM ranked WHERE run_id=p_result)) FROM private.arcade_runs WHERE id=p_result AND user_id=p_actor AND game=p_game AND status<>'active')) INTO answer;
 RETURN answer;
END $function$
;
INSERT INTO private.arcade_rulesets(id,game,config,enabled) VALUES('tri-towers/3','tri-towers','{"version":"tri-towers/3","stages":2,"bonusThreshold":80000,"maxBonusStages":1,"streakAwards":[100,200,400,600,800,1000,1200,1500,2000],"drawPenalty":100,"peakBonuses":[5000,10000,15000],"stageMs":120000,"readyMs":30000,"holdMs":5000,"timePerSecond":10,"stockPerCard":1000,"wrap":true,"roundIntroMs":2500}',false) ON CONFLICT(id) DO NOTHING;
NOTIFY pgrst,'reload schema';
